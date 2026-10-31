param([Parameter(Mandatory=$true)][string]$GameDir)
$ErrorActionPreference='Stop'
if(-not $IsWindows -and $PSVersionTable.PSEdition -ne 'Desktop'){throw '自动登录凭据需要 Windows DPAPI；其他平台请使用游戏内正常登录。'}
$profilePath=[IO.Path]::GetFullPath($GameDir)
$settingsPath=Join-Path $profilePath 'config/qiandengji-client-mode.json'
$settings=Get-Content -LiteralPath $settingsPath -Raw|ConvertFrom-Json
if($settings.mode -notin @('player','observer') -or $settings.username -notmatch '^[_A-Za-z0-9]{1,16}$' -or $settings.server -match '[\s/@?#\\]'){throw '先使用 configure.mjs 配置本机账号和服务器。'}
if($settings.mode -eq 'observer' -and $settings.username -notmatch '^[_A-Za-z0-9]{1,12}_eye$'){throw '观战账号必须为 xxx_eye。'}
Add-Type -AssemblyName System.Security
$privatePath=Join-Path $profilePath 'config/private'
[IO.Directory]::CreateDirectory($privatePath)|Out-Null
$scope=[Text.Encoding]::UTF8.GetBytes($settings.server.ToLowerInvariant()+"`n"+$settings.username.ToLowerInvariant())
$digest=[Security.Cryptography.SHA256]::Create()
try{$scopeId=([BitConverter]::ToString($digest.ComputeHash($scope))).Replace('-','').ToLowerInvariant()}finally{$digest.Dispose()}
$credentialPath=Join-Path $privatePath ('login-'+$scopeId+'.dpapi')
$password=Read-Host '输入此服务器、此账号原有的服务器密码（不会显示；不要输入微软账号密码）' -AsSecureString
$pointer=[IntPtr]::Zero
$plain=$null
try{
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  $text=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if([string]::IsNullOrEmpty($text) -or $text.Length -gt 128 -or $text -match '\s'){throw '密码必须为非空、不含空白、最多 128 位的服务器密码。'}
  $plain=[Text.Encoding]::UTF8.GetBytes($text)
  $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($credentialPath,$cipher)
}finally{
  $text=$null
  if($plain){[Array]::Clear($plain,0,$plain.Length)}
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  $password.Dispose()
}
$loginPath=Join-Path $profilePath 'config/cortico-client-login.json'
$accounts=@()
if(Test-Path -LiteralPath $loginPath){
  $old=Get-Content -LiteralPath $loginPath -Raw|ConvertFrom-Json
  $accounts=@($old.accounts|Where-Object { -not ($_.server -eq $settings.server -and $_.username -eq $settings.username) })
}
$accounts+=@([pscustomobject]@{server=$settings.server;username=$settings.username;credentialFile=$credentialPath;command='login';requestMarkers=@('MC_AUTH_LOGIN');successMarkers=@('MC_AUTH_SUCCESS');failureMarkers=@('MC_AUTH_FAILED','MC_AUTH_2FA','MC_AUTH_UNAVAILABLE');reauthMarkers=@();reconnect=$true})
$temporary=$loginPath+'.'+[Guid]::NewGuid().ToString()+'.tmp'
[IO.File]::WriteAllText($temporary,(@{enabled=$true;accounts=$accounts}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
Move-Item -LiteralPath $temporary -Destination $loginPath -Force
Write-Output '已为原服务器与账号保存当前 Windows 用户的加密凭据。重新连接后生效；未注册、重置或更换任何角色。'
