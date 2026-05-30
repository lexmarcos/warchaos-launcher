# WarChaos Launcher - Reverse Engineering Report

## Metodo de Extracao

O `WarChaosLauncher.exe` e um executavel nativo .NET 8 que funciona como **apphost** para um assembly .NET chamado `WarChaosLauncher.dll`.

### Estrutura do arquivo

```
[0x000000 - 0x02A800] PE nativo (apphost .NET)
[0x02A800 - 0x02B000] Padding (zeros)
[0x02B000 - 0xAF0E00] WarChaosLauncher.dll (assembly .NET principal)
[0xAF0E00 - 0xB3B508] Overlay Costura (DLLs comprimidas)
[0xB3B508 - 0xB41D86] .deps.json + .runtimeconfig.json
```

### Protecoes

- **Obfuscador**: Obfuscar + Eazfuscator.NET
- **Costura.Fody**: DLLs comprimidas e embedadas (Deflate raw, sem header zlib, window bits -15)
- **Strings ofuscadas**: Tabela de strings criptografada com XOR, chave derivada do hash do assembly

### DLLs embedadas via Costura

| DLL | Tamanho |
|-----|---------|
| Costura.dll | 5.120 bytes |
| Guna.UI2.dll | 2.244.480 bytes |
| Newtonsoft.Json.dll | 723.368 bytes |
| System.CodeDom.dll | 183.560 bytes |
| Vlc.DotNet.Core.dll | 66.048 bytes |
| Vlc.DotNet.Core.Interops.dll | 79.872 bytes |
| Vlc.DotNet.Forms.dll | 24.576 bytes |

### Decodificacao das strings

A classe `<Module>` contem um inicializador estatico que configura o decoder de strings.
A funcao `\u0006\u0016.\u0005(int key)` recebe uma chave inteira e retorna a string decodificada.

A tabela de strings fica em um recurso embedado cujo nome e derivado de:
```
num = -679303889
num2 = num + 1573417278
ResourceName = chr(0x02) + chr(0x05) + chr(0x18) + chr(0x1b) + chr(0x03) + chr(0x02) + chr(0x1b) + chr(0x10) + chr(0x18) + chr(0x10) + chr(0x10)
```

Para decodificar em runtime, usei um projeto .NET que carrega a DLL via `AssemblyLoadContext`
e invoca o metodo via reflection.

---

## Comando de Inicializacao do Game.exe

### Caminho

```
{gamePath}\Bin64Release\Game.exe
```

O launcher procura nesta ordem:
1. `{BaseDirectory}\Bin64Release\Game.exe`
2. `{BaseDirectory}\..\Bin64Release\Game.exe`
3. `C:\Program Files\WarChaos\Bin64Release\Game.exe`

### Argumentos (flags)

```
+ui_show_cohtml 0
+sys_use_cohtml_ui 0
+r_DisplayInfo 0
-Language Portuguese
-username "<usuario>"
-password "<senha>"
```

### Keys decodificadas usadas na montagem dos argumentos

| Key | Valor |
|-----|-------|
| 1675718352 | `+online_use_tls 1 ` |
| 1675714879 | `+online_use_protect 0 ` |
| 1675714842 | `+ui_show_cohtml ` |
| 1675714819 | `+sys_use_cohtml_ui ` |
| 1675714921 | `+r_DisplayInfo 0 ` |
| 1675714897 | `-Language Portuguese ` |
| 1675715005 | `-username "` |
| 1675714970 | `-password "` |
| 1675714979 | `" ` |
| 1675718360 | `  ` (espaco duplo) |
| 1675718390 | `+online_server ` (presente no codigo mas nao usado na versao final) |

### ProcessStartInfo

```csharp
new ProcessStartInfo {
    FileName = gamePath,
    Arguments = arguments,
    UseShellExecute = false
}
```

WorkingDirectory = diretorio do Game.exe (Bin64Release)

---

## API do Launcher Original

### Servidores

| Ambiente | Endereco |
|----------|----------|
| Producao | `http://181.214.221.245:80` |
| Auth interno | `http://181.214.221.245:3001` |
| Debug local | `http://127.0.0.1:3000` |

### Endpoints

| Metodo | Path | Descricao |
|--------|------|-----------|
| POST | `/internal/launcher/login` | Login do launcher |
| POST | `/internal/launcher/authorize-play` | Autorizar inicio de jogo |
| POST | `/api/v1/register` | Registro de conta |
| POST | `/api/v1/login` | Login publico |
| GET | `/api/v1/status` | Status do servidor |
| GET | `/api/v1/launcher/allow` | Verificar se launcher esta liberado |
| GET | `/api/v1/ranking/players` | Ranking de jogadores |
| GET | `/api/v1/ranking/clans` | Ranking de clans |
| GET | `/warface/launcher/news.json` | Noticias |
| GET | `/warface/client/manifest/clientTotalManifest.json` | Manifesto de arquivos |
| GET | `/warface/client/manifest/binManifest.json` | Manifesto de binarios |
| GET | `/warface/launcher/config/ThemeConfig.xml` | Tema |
| GET | `/warface/launcher/config/PcConfig.xml` | Configuracao PC |
| GET | `/warface/launcher/config/LauncherConfig.xml` | Config do launcher |
| POST | `/launcher/coupon/preview` | Preview de cupom |
| POST | `/launcher/coupon/redeem` | Resgatar cupom |

### Fluxo de login original

1. Usuario digita username + password no launcher
2. HWID gerado do hardware:
   - MAC address
   - CPU ID
   - Disk serial
   - Motherboard serial
   - Public IP (via `https://api.ipify.org`)
   - Local IPv4
3. `POST /internal/launcher/login` com JSON:
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
4. Resposta inclui: `token`, `account_info`, `profile_info`, `game_money`
5. `POST /internal/launcher/authorize-play` para obter IP:porta do servidor
6. Game.exe e lancado com os argumentos descritos acima

### Conexao do jogo

- DNS: `game.warchaos.xyz`
- Game server: `37.148.133.32:9107`
- Admin WebSocket: `ws://game.warchaos.xyz:9110`

### Armazenamento local

- Credenciais salvas via DPAPI (`System.Security.Cryptography.ProtectedData`)
- Arquivo: `%APPDATA%\WarChaos\.wcsave`
- Configuracoes: `%APPDATA%\WarChaos\prefs.local.json`
  ```json
  {"gamePath":"C:\\Program Files\\WarChaos","language":"pt-BR","darkTheme":true,"autoLogin":false}
  ```

---

## Game.exe - Flags nativas do CryEngine

Game.exe e um loader CryEngine que carrega `CryGame.dll`.

### Flags nativas encontradas

| Flag | Descricao |
|------|-----------|
| `-language <lang>` | Idioma (ex: `Portuguese`, `brazilianportuguese`) |
| `-devmode` | Modo desenvolvedor |
| `-testmode` | Modo teste |
| `-memReplay` | Memory replay |
| `-windowid <id>` | Window ID (para embedding) |
| `-mod <mod>` | Mod parameter |

O jogo usa XMPP (Jabber) para autenticacao online (`CryOnline.dll` contem referencias a `jabber.org/features/iq-auth`).

### Strings relevantes do Game.exe

- `C:\Build\trunk\main\src\Bin64\Game.pdb` (caminho de build original)
- `CryGame.dll` (DLL principal do jogo)
- `sys_dll_game` (nome do modulo)
- `restarting:  -mod ` (parametro de restart)

---

## Keys completas decodificadas

Todas as strings decodificadas do launcher organizadas por categoria:

### Comando de lancamento
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

### Caminhos
| Key | String |
|-----|--------|
| 1675718023 | `Bin64Release` |
| 1675718335 | `Game.exe` |

### Servidor
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

### UI Labels (exemplos)
| Key | String |
|-----|--------|
| 1675705092 | `Iniciante` |
| 1675705204 | `Recruta` |
| 1675706433 | `status` |
| 1675706498 | `username` |
| 1675706611 | `msg` |
| 1675706601 | `ToString` |

### Versao
| Key | String |
|-----|--------|
| 1675690391 | `1.0.0.0` |
| 1675690369 | `WarChaosLauncherFile.zip` |
| 1675690466 | `Nova versao disponivel com melhorias de estabilidade.` |

### Mensagens de Erro (exemplos)
| Key | String |
|-----|--------|
| 1675718312 | `Executavel nao encontrado do jogo nao encontrado...` |
| 1675717686 | `Falha ao gerar o Manifest local.` |
| 1675717690 | `1.0.0` |
| 1675717647 | `Erro ao carregar o Manifest local.` |
| 1675693647 | `desconhecido` |

---

## Game.exe - Detalhes tecnicos

- **Build original**: `C:\Build\trunk\main\src\Bin64\Game.pdb`
- **Tipo**: PE32+ (x64), compilado com MSVC
- **Tamanho**: 294.480 bytes
- **DLL principal**: `CryGame.dll` (carregada em runtime)
- **Engine**: CryEngine (Warface branch)
- **Protocolo de rede**: XMPP com SASL authentication
- **Assets**: Sistema de .pak files no diretorio `Game/`

### Logs de conexao
```
%APPDATA%\WarChaos\net_connect.log
```
Exemplo:
```
DNS consultando game.warchaos.xyz
TCP tentando 37.148.133.32:9107
TCP conectado 37.148.133.32:9107
AdminWS tentando ws://game.warchaos.xyz:9110
AdminWS conectado ws://game.warchaos.xyz:9110
```
