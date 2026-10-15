"""Import the four original boardgame entrepreneurs and printed accessories."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name("prepare-table-motion-assets.py")), run_name="__main__")
