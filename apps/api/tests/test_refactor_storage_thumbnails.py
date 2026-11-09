"""Refactor: accès unique, provider S3 optionnel, miniatures."""
import io
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.projects.access import get_owned_project, user_has_project_access
from app.projects.thumbnails import make_thumbnail_bytes, thumbnail_key
from app.storage.providers.s3 import S3StorageProvider


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _auth(client, label):
    email = f"{label}-{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "password123", "accepted_terms": True, "age_confirmed": True, "newsletter_opt_in": False})
    assert r.status_code == 201, r.text
    t = client.post("/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {t.json()['access_token']}"}


def _page(client, headers):
    p = client.post("/projects", headers=headers, json={"name": "Thumb", "source_lang": "en", "target_lang": "fr", "content_type": "manga"})
    pid = p.json()["id"]
    buf = io.BytesIO(); Image.new("RGB", (800, 1000), color="white").save(buf, format="PNG")
    up = client.post(f"/projects/{pid}/upload", headers=headers, files={"file": ("p.png", buf.getvalue(), "image/png")})
    ex = client.post(f"/projects/{pid}/files/{up.json()['id']}/extract", headers=headers)
    assert ex.status_code == 201, ex.text
    return pid, ex.json()[0]


def test_thumbnail_field_and_endpoint(client):
    headers = _auth(client, "thumb")
    pid, page = _page(client, headers)
    assert page["thumbnail_url"] == f"/pages/{page['id']}/thumbnail"
    detail = client.get(f"/projects/{pid}", headers=headers)
    assert detail.json()["pages"][0]["thumbnail_url"] == f"/pages/{page['id']}/thumbnail"
    thumb = client.get(f"/pages/{page['id']}/thumbnail", headers=headers)
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/png"
    with Image.open(io.BytesIO(thumb.content)) as img:
        assert max(img.size) <= 320
    outsider = _auth(client, "thumb-out")
    assert client.get(f"/pages/{page['id']}/thumbnail", headers=outsider).status_code == 404


def test_thumbnail_bytes_shrink():
    buf = io.BytesIO(); Image.new("RGB", (1000, 500), color="red").save(buf, format="PNG")
    out = make_thumbnail_bytes(buf.getvalue())
    with Image.open(io.BytesIO(out)) as img:
        assert img.size == (320, 160)


class _FakeBody:
    def __init__(self, data): self._d = data
    def read(self): return self._d


class _FakeS3:
    def __init__(self): self.store = {}
    def put_object(self, Bucket, Key, Body): self.store[(Bucket, Key)] = Body
    def get_object(self, Bucket, Key):
        if (Bucket, Key) not in self.store:
            e = Exception("NoSuchKey"); e.response = {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}}; raise e
        return {"Body": _FakeBody(self.store[(Bucket, Key)])}
    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.store:
            e = Exception("404"); e.response = {"Error": {"Code": "404"}, "ResponseMetadata": {"HTTPStatusCode": 404}}; raise e
        return {}
    def delete_object(self, Bucket, Key): self.store.pop((Bucket, Key), None)


def test_s3_provider_crud_with_fake_client():
    fake = _FakeS3()
    s3 = S3StorageProvider(bucket="b", client=fake, prefix="pre")
    s3.save("a/b.png", b"123")
    assert s3.read("a/b.png") == b"123" and s3.exists("a/b.png")
    with pytest.raises(FileNotFoundError):
        s3.read("missing.png")
    assert not s3.exists("missing.png")
    s3.delete("a/b.png"); assert not s3.exists("a/b.png")


def test_s3_requires_bucket_and_boto3_is_optional():
    with pytest.raises(RuntimeError):
        S3StorageProvider(bucket="", client=_FakeS3())
    # Local default must not need boto3: app already imported above.
    from app.storage.dependencies import storage_provider
    assert storage_provider.__class__.__name__ == "LocalStorageProvider"
    assert thumbnail_key(uuid.UUID(int=1), uuid.UUID(int=2)).endswith(".png")
