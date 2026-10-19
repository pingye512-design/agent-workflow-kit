# -*- coding: utf-8 -*-
"""最小测试：演示「命令 + 输出 + 时间戳」里的命令部分。

    python3 -m unittest discover -s examples/hello-service -v
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import add  # noqa: E402


class TestAdd(unittest.TestCase):
    def test_normal(self):
        self.assertEqual(add(1, 2), 3)

    def test_negative(self):
        self.assertEqual(add(-1, 1), 0)

    def test_float(self):
        self.assertAlmostEqual(add(0.1, 0.2), 0.3, places=6)


if __name__ == "__main__":
    unittest.main()
