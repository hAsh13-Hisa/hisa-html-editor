Add-Type -AssemblyName System.Drawing

$sourcePath = "assets/icon.png"
$targetPath = "assets/icon.ico"

$src = [System.Drawing.Image]::FromFile((Resolve-Path $sourcePath))

$sizes = @(256, 128, 64, 48, 32, 16)
$images = @()

foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $sz, $sz)
    $g.Dispose()

    $ms = New-Object System.IO.MemoryStream
    # 256はPNGで保存、それ以外もPNGでICOに埋め込む
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $images += @{
        Width = $sz
        Height = $sz
        Bytes = $ms.ToArray()
    }
    $ms.Dispose()
    $bmp.Dispose()
}
$src.Dispose()

# ICOバイナリ構造を作成
$fs = [System.IO.File]::Create((Resolve-Path .).Path + "/assets/icon.ico")
$bw = New-Object System.IO.BinaryWriter $fs

# ICONDIR Header
$bw.Write([uint16]0) # Reserved
$bw.Write([uint16]1) # Type 1 = ICO
$bw.Write([uint16]$images.Count) # Number of images

# Header size (6) + entries size (16 * count)
$offset = 6 + (16 * $images.Count)

foreach ($img in $images) {
    $w = if ($img.Width -ge 256) { 0 } else { [byte]$img.Width }
    $h = if ($img.Height -ge 256) { 0 } else { [byte]$img.Height }
    $bw.Write([byte]$w)
    $bw.Write([byte]$h)
    $bw.Write([byte]0) # Color count
    $bw.Write([byte]0) # Reserved
    $bw.Write([uint16]1) # Color planes
    $bw.Write([uint16]32) # Bits per pixel
    $bw.Write([uint32]$img.Bytes.Length) # Image data size
    $bw.Write([uint32]$offset) # Offset
    $offset += $img.Bytes.Length
}

foreach ($img in $images) {
    $bw.Write($img.Bytes)
}

$bw.Flush()
$bw.Close()
$fs.Close()

Write-Output "Successfully generated assets/icon.ico"
