from app.core.security import generate_token, hash_token


def test_tokens_are_long_and_unique() -> None:
    tokens = {generate_token() for _ in range(100)}
    assert len(tokens) == 100
    assert all(len(token) >= 40 for token in tokens)


def test_hash_is_stable_and_does_not_reveal_the_token() -> None:
    token = generate_token()
    assert hash_token(token) == hash_token(token)
    assert token not in hash_token(token)
    assert len(hash_token(token)) == 64


def test_different_tokens_have_different_hashes() -> None:
    assert hash_token("a") != hash_token("b")
