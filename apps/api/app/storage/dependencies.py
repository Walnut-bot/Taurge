from app.core.config import settings
from app.storage.provider import StorageProvider
from app.storage.providers.local import LocalStorageProvider


def _build_provider() -> StorageProvider:
    if settings.storage_provider == "s3":
        from app.storage.providers.s3 import S3StorageProvider

        return S3StorageProvider(
            bucket=settings.s3_bucket,
            prefix=settings.s3_prefix,
            endpoint_url=settings.s3_endpoint_url,
            region_name=settings.s3_region,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
        )
    if settings.storage_provider not in ("", "local"):
        raise RuntimeError(
            f"STORAGE_PROVIDER inconnu : {settings.storage_provider!r} (attendu 'local' ou 's3')."
        )
    return LocalStorageProvider(base_path=settings.storage_path)


# Singleton construit à l'import (local par défaut, sans boto3).
storage_provider: StorageProvider = _build_provider()


def get_storage_provider() -> StorageProvider:
    return storage_provider
