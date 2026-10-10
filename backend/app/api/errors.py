"""One error format for the whole API.

Every error response has a plain-sentence `detail`. Problems with a specific survey answer also
carry `errors`, a list of {"field", "message"}, so the app can show each message under the right
box. Callers never have to handle two different shapes.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.calc.calorie_target import InvalidInputError

_PYDANTIC_PREFIX = "Value error, "


def _field_name(location: tuple[str | int, ...]) -> str:
    # location looks like ("body", "height_cm"); the first part is where the data came from.
    return ".".join(str(part) for part in location[1:])


def _clean(message: str) -> str:
    return message.removeprefix(_PYDANTIC_PREFIX)


async def _invalid_input(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, InvalidInputError)
    return JSONResponse(
        status_code=422,
        content={
            "detail": error.message,
            "errors": [{"field": error.field, "message": error.message}],
        },
    )


async def _invalid_request(_request: Request, error: Exception) -> JSONResponse:
    assert isinstance(error, RequestValidationError)
    problems = [
        {"field": _field_name(item["loc"]), "message": _clean(item["msg"])}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"detail": "Some answers need fixing.", "errors": problems},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(InvalidInputError, _invalid_input)
    app.add_exception_handler(RequestValidationError, _invalid_request)
