"""Provider S3-compatible (AWS S3, Cloudflare R2, MinIO, Supabase…).

boto3 est une dépendance OPTIONNELLE : il n'est importé que si ce
provider est sélectionné (STORAGE_PROVIDER=s3). Sans boto3 installé,
la sélection lève une erreur explicite au démarrage du provider,
jamais à l'import du module. Installer avec : pip install -r requirements-s3.txt
"""
import logging

logger = logging.getLogger(__name__)


def _is_not_found(exc: Exception) -> bool:
    response = getattr(exc, "response", None) or {}
    error = response.get("Error", {}) if isinstance(response, dict) else {}
    code = str(error.get("Code", ""))
    status = (response.get("ResponseMetadata", {}) or {}).get("HTTPStatusCode")
    return code in ("NoSuchKey", "NoSuchBucket", "404", "NotFound") or status == 404


class S3StorageProvider:
    """Implémente StorageProvider sur un bucket S3-compatible."""

    def __init__(self, bucket: str, *, client=None, prefix: str = "", endpoint_url: str | None = None, region_name: str | None = None, access_key_id: str | None = None, secret_access_key: str | None = None):
        if not bucket:
            raise RuntimeError("S3_BUCKET est requis quand STORAGE_PROVIDER=s3.")
        self.bucket = bucket
        self.prefix = prefix.strip("/")
        if client is not None:
            self._client = client
        else:
            try:
                import boto3  # type: ignore
            except ImportError as exc:
                raise RuntimeError(
                    "STORAGE_PROVIDER=s3 requiert boto3 (dépendance optionnelle) : "
                    "pip install -r requirements-s3.txt"
                ) from exc
            kwargs = {}
            if endpoint_url:
                kwargs["endpoint_url"] = endpoint_url
            if region_name:
                kwargs["region_name"] = region_name
            if access_key_id:
                kwargs["aws_access_key_id"] = access_key_id
            if secret_access_key:
                kwargs["aws_secret_access_key"] = secret_access_key
            self._client = boto3.client("s3", **kwargs)

    def _key(self, key: str) -> str:
        return f"{self.prefix}/{key}" if self.prefix else key

    def save(self, key: str, content: bytes) -> None:
        self._client.put_object(Bucket=self.bucket, Key=self._key(key), Body=content)

    def read(self, key: str) -> bytes:
        try:
            resp = self._client.get_object(Bucket=self.bucket, Key=self._key(key))
        except Exception as exc:
            if _is_not_found(exc):
                raise FileNotFoundError(key) from exc
            raise
        body = resp["Body"]
        return body.read() if hasattr(body, "read") else bytes(body)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=self._key(key))
            return True
        except Exception as exc:
            if _is_not_found(exc):
                return False
            return False

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=self._key(key))
        except Exception:
            logger.exception("Suppression S3 échouée pour %s", key)
