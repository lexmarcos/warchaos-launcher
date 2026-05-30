# WarChaos Launcher — Reverse Engineering Report

## Extraction Method

`WarChaosLauncher.exe` is a native .NET 8 executable that acts as an **apphost** for a .NET assembly called `WarChaosLauncher.dll`.

### File structure

```
[0x000000 - 0x02A800] Native PE (apphost)
[0x02A800 - 0x02B000] Padding (zeros)
[0x02B000 - 0xAF0E00] WarChaosLauncher.dll (main .NET assembly)
[0xAF0E00 - 0xB3B508] Costura overlay (compressed DLLs)
[0xB3B508 - 0xB41D86] .deps.json + .runtimeconfig.json
```

### Protections

- **Obfuscator**: Obfuscar + Eazfuscator.NET
- **Costura.Fody**: DLLs compressed and embedded (raw Deflate, no zlib header, window bits -15)
- **String obfuscation**: Encrypted string table with XOR, key derived from assembly hash

### Embedded DLLs (Costura)

| DLL | Size |
|-----|------|
| Costura.dll | 5,120 bytes |
| Guna.UI2.dll | 2,244,480 bytes |
| Newtonsoft.Json.dll | 723,368 bytes |
| System.CodeDom.dll | 183,560 bytes |
| Vlc.DotNet.Core.dll | 66,048 bytes |
| Vlc.DotNet.Core.Interops.dll | 79,872 bytes |
| Vlc.DotNet.Forms.dll | 24,576 bytes |

### String decoding

The `<Module>` class contains a static initializer that sets up the string decoder.
The function `\u0006\u0016.\u0005(int key)` takes an integer key and returns the decoded string.

The string table is stored in an embedded resource whose name is derived from:
```
num = -679303889
num2 = num + 1573417278
ResourceName = chr(0x02) + chr(0x05) + chr(0x18) + chr(0x1b) + chr(0x03) + chr(0x02) + chr(0x1b) + chr(0x10) + chr(0x18) + chr(0x10) + chr(0x10)
```

To decode at runtime, a .NET project was created that loads the extracted DLL via `AssemblyLoadContext`
and invokes the method through reflection.

---

## Game.exe Launch Command

### Path

```
{gamePath}\Bin64Release\Game.exe
```

The launcher searches in this order:
1. `{BaseDirectory}\Bin64Release\Game.exe`
2. `{BaseDirectory}\..\Bin64Release\Game.exe`
3. `C:\Program Files\WarChaos\Bin64Release\Game.exe`

### Arguments (flags)

```
+ui_show_cohtml 0
+sys_use_cohtml_ui 0
+r_DisplayInfo 0
-Language Portuguese
-username "<username>"
-password "<password>"
```

### Decoded keys used in argument building

| Key | Value |
|-----|-------|
| 1675718352 | `+online_use_tls 1 ` |
| 1675714879 | `+online_use_protect 0 ` |
| 1675714842 | `+ui_show_cohtml ` |
| 1675714819 | `+sys_use_cohtml_ui ` |
| 1675714921 | `+r_DisplayInfo 0 ` |
| 1675714897 | `-Language Portuguese ` |
| 1675715005 | `-username "` |
| 1675714970 | `-password "` |
| 1675714979 | `" ` (closing quote + space) |
| 1675718360 | `  ` (double space separator) |
| 1675718390 | `+online_server ` (present in code, not used in final build) |

The launcher originally also passed `+online_server <IP:port>` but this was not included
in the argument string of the analyzed build.

### ProcessStartInfo

```csharp
new ProcessStartInfo {
    FileName = gamePath,
    Arguments = arguments,
    UseShellExecute = false
}
```

WorkingDirectory = Game.exe directory (Bin64Release)

---

## Original Launcher API

### Servers

| Environment | Address |
|-------------|---------|
| Production | `http://181.214.221.245:80` |
| Internal auth | `http://181.214.221.245:3001` |
| Debug local | `http://127.0.0.1:3000` |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/internal/launcher/login` | Launcher login |
| POST | `/internal/launcher/authorize-play` | Authorize game start |
| POST | `/api/v1/register` | Account registration |
| POST | `/api/v1/login` | Public login |
| GET | `/api/v1/status` | Server status |
| GET | `/api/v1/launcher/allow` | Check if launcher is allowed |
| GET | `/api/v1/ranking/players` | Player rankings |
| GET | `/api/v1/ranking/clans` | Clan rankings |
| GET | `/warface/launcher/news.json` | News feed |
| GET | `/warface/client/manifest/clientTotalManifest.json` | Full file manifest |
| GET | `/warface/client/manifest/binManifest.json` | Binary manifest |
| GET | `/warface/launcher/config/ThemeConfig.xml` | Theme config |
| GET | `/warface/launcher/config/PcConfig.xml` | PC config |
| GET | `/warface/launcher/config/LauncherConfig.xml` | Launcher config |
| POST | `/launcher/coupon/preview` | Coupon preview |
| POST | `/launcher/coupon/redeem` | Redeem coupon |

### Original login flow

1. User types username + password in the launcher
2. HWID is generated from hardware:
   - MAC address
   - CPU ID
   - Disk serial
   - Motherboard serial
   - Public IP (via `https://api.ipify.org`)
   - Local IPv4
3. `POST /internal/launcher/login` with JSON:
   ```json
   {
     "username": "...",
     "password": "...",
     "hwid": "...",
     "mac": "...",
     "cpu": "...",
     "disk": "...",
     "motherboard": "...",
     "public_ip": "...",
     "ipv4": "..."
   }
   ```
4. Response includes: `token`, `account_info`, `profile_info`, `game_money`
5. `POST /internal/launcher/authorize-play` to get game server IP:port
6. Game.exe is launched with the arguments described above

### Game connection

- DNS: `game.warchaos.xyz`
- Game server: `37.148.133.32:9107`
- Admin WebSocket: `ws://game.warchaos.xyz:9110`

### Local storage

- Credentials saved via DPAPI (`System.Security.Cryptography.ProtectedData`)
- File: `%APPDATA%\WarChaos\.wcsave`
- Settings: `%APPDATA%\WarChaos\prefs.local.json`
  ```json
  {"gamePath":"C:\\Program Files\\WarChaos","language":"pt-BR","darkTheme":true,"autoLogin":false}
  ```

---

## Game.exe — CryEngine Native Flags

Game.exe is a CryEngine loader that loads `CryGame.dll`.

### Native flags found

| Flag | Description |
|------|-------------|
| `-language <lang>` | Language (e.g. `Portuguese`, `brazilianportuguese`) |
| `-devmode` | Developer mode |
| `-testmode` | Test mode |
| `-memReplay` | Memory replay |
| `-windowid <id>` | Window ID (for embedding) |
| `-mod <mod>` | Mod parameter |

The game uses XMPP (Jabber) for online authentication (`CryOnline.dll` contains references
to `jabber.org/features/iq-auth`).

### Notable Game.exe strings

- `C:\Build\trunk\main\src\Bin64\Game.pdb` (original build path)
- `CryGame.dll` (main game DLL)
- `sys_dll_game` (module name)
- `restarting:  -mod ` (restart parameter)

---

## Complete Decoded Keys

All strings decoded from the launcher, organized by category:

### Launch command
| Key | String |
|-----|--------|
| 1675718390 | `+online_server ` |
| 1675718360 | `  ` |
| 1675718352 | `+online_use_tls 1 ` |
| 1675714879 | `+online_use_protect 0 ` |
| 1675714842 | `+ui_show_cohtml ` |
| 1675714819 | `+sys_use_cohtml_ui ` |
| 1675714921 | `+r_DisplayInfo 0 ` |
| 1675714897 | `-Language Portuguese ` |
| 1675715005 | `-username "` |
| 1675714979 | `" ` |
| 1675714970 | `-password "` |

### Paths
| Key | String |
|-----|--------|
| 1675718023 | `Bin64Release` |
| 1675718335 | `Game.exe` |

### Server config
| Key | String |
|-----|--------|
| 1675714540 | `http://` |
| 1675710761 | `181.214.221.245` |
| 1675710739 | `80` |
| 1675714107 | `3001` |
| 1675714510 | `3000` |
| 1675714526 | `127.0.0.1` |
| 1675710822 | `:` |
| 1675710830 | `/` |

### API Endpoints
| Key | String |
|-----|--------|
| 1675713231 | `api/v1/register` |
| 1675713841 | `api/v1/login` |
| 1675713830 | `api/v1/status` |
| 1675713802 | `api/v1/ranking/clans` |
| 1675713911 | `api/v1/ranking/players` |
| 1675713874 | `api/v1/launcher/allow` |
| 1675714412 | `internal/launcher/login` |
| 1675714382 | `internal/launcher/authorize-play` |
| 1675714471 | `launcher/coupon/preview` |
| 1675714433 | `launcher/coupon/redeem` |
| 1675714317 | `warface/launcher/news.json` |
| 1675713982 | `warface/client/manifest/clientTotalManifest.json` |
| 1675713927 | `warface/launcher/` |
| 1675714031 | `warface/launcher/manifest/launcherManifest.json` |
| 1675713585 | `warface/launcher/config/ThemeConfig.xml` |
| 1675713539 | `warface/launcher/config/PcConfig.xml` |
| 1675713624 | `warface/launcher/config/LauncherConfig.xml` |
| 1675713711 | `warface/client/manifest/binManifest.json` |
| 1675713784 | `warface/launcher/repair/Launcher.pak` |
| 1675713749 | `warface/launcher/repair/WarChaosUpdater.exe` |
| 1675714331 | `warface/client/` |

### HTTP/JSON
| Key | String |
|-----|--------|
| 1675712090 | `application/json` |
| 1675712067 | `ok` |
| 1675712186 | `reason` |
| 1675712167 | `banned_fingerprint` |
| 1675712181 | `unknown` |
| 1675711381 | `https://api.ipify.org` |

### UI Labels (samples)
| Key | String |
|-----|--------|
| 1675705092 | `Iniciante` (Beginner) |
| 1675705204 | `Recruta` (Recruit) |
| 1675706433 | `status` |
| 1675706498 | `username` |
| 1675706611 | `msg` |
| 1675706601 | `ToString` |

### Version
| Key | String |
|-----|--------|
| 1675690391 | `1.0.0.0` |
| 1675690369 | `WarChaosLauncherFile.zip` |
| 1675690466 | `Nova versao disponivel com melhorias de estabilidade.` |

### Error messages (samples)
| Key | String |
|-----|--------|
| 1675718312 | `Executavel nao encontrado do jogo nao encontrado...` |
| 1675717686 | `Falha ao gerar o Manifest local.` |
| 1675717690 | `1.0.0` |
| 1675717647 | `Erro ao carregar o Manifest local.` |
| 1675693647 | `desconhecido` (unknown) |

---

## Game.exe — Technical Details

- **Original build**: `C:\Build\trunk\main\src\Bin64\Game.pdb`
- **Type**: PE32+ (x64), compiled with MSVC
- **Size**: 294,480 bytes
- **Main DLL**: `CryGame.dll` (loaded at runtime)
- **Engine**: CryEngine (Warface branch)
- **Network protocol**: XMPP with SASL authentication
- **Assets**: `.pak` file system in the `Game/` directory

### Connection logs
```
%APPDATA%\WarChaos\net_connect.log
```
Sample:
```
DNS consulting game.warchaos.xyz
TCP attempting 37.148.133.32:9107 source=dns:game.warchaos.xyz host=game.warchaos.xyz
TCP connected 37.148.133.32:9107 source=dns:game.warchaos.xyz
AdminWS attempting ws://game.warchaos.xyz:9110
AdminWS connected ws://game.warchaos.xyz:9110
```
