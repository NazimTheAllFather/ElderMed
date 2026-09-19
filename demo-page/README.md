# About You demo

From the ElderMed repository folder, run:

```sh
python -m http.server 5174 --bind 127.0.0.1 --directory demo-page
```

Or from `frontend/`:

```sh
npm run demo
```

On Windows you can use `py` instead of `python`. Open http://127.0.0.1:5174 in Chrome. Stop with Control+C.

This page is served on port 5174 so it does not collide with the ElderMed FastAPI backend on port 8000.

This single-page demo preserves the About You field IDs for extension testing. First and last names start blank and disabled. Save stores editable values in this browser tab's sessionStorage. Next displays a local confirmation. Nothing is submitted to Virginia.

The layout, stylesheet, and images originate from Virginia CommonHelp. This demo is not affiliated with or endorsed by Virginia agencies. Use fictional data for testing. The extra “ElderMed test controls” block at the bottom is labeled sample UI for the voice assistant and is not part of a real application.
