$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sizes = @(16, 48, 128)
Add-Type -AssemblyName System.Drawing

foreach ($size in $sizes) {
  $output = Join-Path $projectRoot ("icons\icon{0}.png" -f $size)
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $outline = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#07030F"))
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#F6F1FF"), $size * 0.0625)
  $slots = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#F6F1FF"), $size * 0.055)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.FillRectangle($background, 0, 0, $size, $size)
    $glowPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $glowPath.AddEllipse($size * 0.05, -$size * 0.55, $size * 1.4, $size * 1.4)
    $glow = [System.Drawing.Drawing2D.PathGradientBrush]::new($glowPath)
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(235, 139, 103, 255)
    $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 43, 20, 112))
    $glow.CenterPoint = [System.Drawing.PointF]::new($size * 0.78, $size * 0.12)
    $graphics.FillRectangle($glow, 0, 0, $size, $size)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $slots.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $slots.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $scale = $size / 128.0
    $inset = 16 * $scale
    $top = 22 * $scale
    $width = 96 * $scale
    $height = 84 * $scale
    $radius = 12 * $scale
    $outline.AddArc($inset, $top, $radius * 2, $radius * 2, 180, 90)
    $outline.AddArc($inset + $width - $radius * 2, $top, $radius * 2, $radius * 2, 270, 90)
    $outline.AddArc($inset + $width - $radius * 2, $top + $height - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $outline.AddArc($inset, $top + $height - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $outline.CloseFigure()
    $graphics.DrawPath($pen, $outline)
    $graphics.DrawLine($slots, 42 * $scale, 26 * $scale, 42 * $scale, 102 * $scale)
    $graphics.DrawLine($slots, 86 * $scale, 26 * $scale, 86 * $scale, 102 * $scale)
    $graphics.DrawLine($slots, 20 * $scale, 44 * $scale, 38 * $scale, 44 * $scale)
    $graphics.DrawLine($slots, 20 * $scale, 84 * $scale, 38 * $scale, 84 * $scale)
    $graphics.DrawLine($slots, 90 * $scale, 44 * $scale, 108 * $scale, 44 * $scale)
    $graphics.DrawLine($slots, 90 * $scale, 84 * $scale, 108 * $scale, 84 * $scale)
    $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $glow.Dispose()
    $glowPath.Dispose()
    $slots.Dispose()
    $pen.Dispose()
    $background.Dispose()
    $outline.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  Write-Output "Rendered $output"
}
