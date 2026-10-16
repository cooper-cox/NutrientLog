from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, read from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+psycopg://nutrientlog:nutrientlog@localhost:5432/nutrientlog"
    # Free key from https://fdc.nal.usda.gov/api-key-signup. Empty turns the USDA lookup off.
    usda_api_key: str = ""
    # Open Food Facts needs no key. Set OPEN_FOOD_FACTS=false to turn it off.
    open_food_facts: bool = True
    # Only Open Food Facts products sold in this country (empty for all). Keeps out foreign-language
    # products that clutter English searches.
    open_food_facts_country: str = "united-states"


settings = Settings()
