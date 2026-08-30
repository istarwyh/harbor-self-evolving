from importlib.metadata import version

from harbor_dsh_evolution import __version__


def test_runtime_version_matches_distribution_metadata() -> None:
    assert __version__ == version("harbor-dsh-evolution")
