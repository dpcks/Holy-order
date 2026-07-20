import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pydantic import AnyHttpUrl, parse_obj_as
import json

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    CORS_ORIGINS: str = '["*"]'
    VAPID_PUBLIC_KEY: str = "BAazjRtXAr7TtIMAwlLReivhL4tsfOma-ideBGfR87CrLroR4H01YaLiZ4pwmuqcF0Qy1V_0cF08MDATEEh-9t4"
    VAPID_PRIVATE_KEY: str = "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgLUqbd46gxaG5Y3SM7aANSN3u_VXvDhlxBviJ7pGC3tehRANCAAQGs40bVwK-07SDAMJS0Xor4S-LbHzpmvonXgRn0fOwqy66EeB9NWGi4meKcJrqnBdEMtVf9HBdPDAwExBIfvbe"
    VAPID_CLAIM_EMAIL: str = "admin@example.com"

    model_config = SettingsConfigDict(env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

    @property
    def cors_origins_list(self) -> List[str]:
        try:
            return json.loads(self.CORS_ORIGINS)
        except:
            return ["*"]

settings = Settings()
