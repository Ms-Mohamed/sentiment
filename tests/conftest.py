import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
FIX = os.path.join(os.path.dirname(__file__), "fixtures")

@pytest.fixture
def fixtures_dir():
    return FIX

@pytest.fixture(autouse=True)
def reset_state():
    import sentiment_processor as sp
    sp.STATE.update({"cursors": {}, "ids": set(), "corpus": [], "posts": [], "heatmap": {}, "last_batch": None})
    yield
