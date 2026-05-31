# WarChaos Direct Launcher

A temporary, lightweight launcher for WarChaos — an alternative Warface server.

## Why this exists

WarChaos is a community-run alternative server for Warface, a game I've loved and played since 2014. After a troubled update, the official WarChaos launcher broke and became unusable. The game itself still worked fine if launched directly — but there was a catch.

My username and password are very long, and the in-game login screen doesn't support clipboard paste (Ctrl+V). The clipboard is disabled inside the game window. Every time I wanted to play, I had to manually type my lengthy password character by character on the in-game screen — for every single session.

That got old fast.

So I reverse-engineered the original `WarChaosLauncher.exe` to understand exactly how it launched `Game.exe` with credentials passed as command-line arguments. Once I knew the flags, I built this minimal launcher to do just one thing: let me type my credentials in a normal text field where paste works, and launch the game directly — no API calls, no updates, no fuss.

## What it does

- Launches `Game.exe` with `-username` and `-password` as command-line arguments
- Remembers your credentials locally (via Tauri's secure store plugin)
- Detects when the game is running to prevent duplicate launches
- Lets you pick a custom `Game.exe` path in Settings
- Zero API communication — fully offline launcher

## Download

You can download the launcher [here](https://github.com/lexmarcos/warchaos-launcher/releases/download/v1.0.0/warchaos-direct-launcher.exe)

## Game launch flags

```
+ui_show_cohtml 0  +sys_use_cohtml_ui 0  +r_DisplayInfo 0 -Language Portuguese -username "your_user" -password "your_pass"
```

## Tech stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Rust + Tauri 2.x
- **Storage**: tauri-plugin-store

## Reverse engineering

The full reverse engineering report is available in [REVERSE_ENGINEERING.md](./REVERSE_ENGINEERING.md). It documents:

- How the original launcher's .NET assembly was extracted from the packed executable
- The obfuscation layers (Obfuscar, Eazfuscator.NET, Costura.Fody)
- The string decryption method and all decoded string keys (80+ entries)
- The complete original API endpoint list
- The original login flow (HWID generation, public IP lookup, auth endpoints)
- CryEngine native flags found inside Game.exe
- Server addresses, ports, and connection logs

## Disclaimer

I am not affiliated with WarChaos, Warface, My.com, or Crytek in any way. This launcher was built purely as a personal convenience tool to avoid the pain of typing a long password on a screen that blocks clipboard paste. No game files were modified, and no API communication takes place.
