import bz2
import gzip
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("cydia_repo", ROOT / "scripts/build-cydia-repo.py")
repo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repo)


class CydiaRepositoryTests(unittest.TestCase):
    def test_empty_repo_is_reproducible_and_all_formats_decompress(self):
        files = repo.render_repository(b"", 0)
        self.assertEqual(files, repo.render_repository(b"", 0))
        self.assertEqual(gzip.decompress(files["Packages.gz"]), b"")
        self.assertEqual(bz2.decompress(files["Packages.bz2"]), b"")
        self.assertIn(b"Date: Thu, 01 Jan 1970 00:00:00 GMT\n", files["Release"])

    def test_existing_index_is_preserved_not_replaced_with_an_empty_repo(self):
        packages = b"Package: example\nVersion: 1.0\nArchitecture: iphoneos-arm\n\n"
        files = repo.render_repository(packages, 0)
        self.assertEqual(files["Packages"], packages)
        self.assertEqual(gzip.decompress(files["Packages.gz"]), packages)
        self.assertEqual(bz2.decompress(files["Packages.bz2"]), packages)

    def test_published_bzip_index_matches_plain_index(self):
        self.assertEqual(bz2.decompress((ROOT / "cydia/Packages.bz2").read_bytes()),
                         (ROOT / "cydia/Packages").read_bytes())


if __name__ == "__main__":
    unittest.main()
