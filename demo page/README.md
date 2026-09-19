# About You demo

From the ElderMed repository folder, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory "demo page"
```

Open http://localhost:8000 in Chrome. Stop with Control+C.

To share on the same Wi-Fi, use `--bind 0.0.0.0` and share your computer's LAN IP with port 8000.

This single-page demo preserves the About You field IDs for extension testing. First and last names start blank and disabled. Save stores editable values in this browser tab's sessionStorage. Next displays a local confirmation. Nothing is submitted to Virginia. Voice and extension integration are not implemented yet.

The layout, stylesheet, and images originate from Virginia CommonHelp. This demo is not affiliated with or endorsed by Virginia agencies. Use fictional data for testing.
