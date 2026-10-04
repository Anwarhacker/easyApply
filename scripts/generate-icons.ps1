# Rebuild Chrome's PNG icons from the same geometry as public/icons/logo.svg.
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '../public/icons'
foreach ($size in @(16, 32, 48, 128)) {
  $canvas = [System.Drawing.Bitmap]::new(512, 512)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.ScaleTransform(4, 4)
  $tile = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $tile.AddArc(4,4,56,56,180,90)
  $tile.AddArc(68,4,56,56,270,90)
  $tile.AddArc(68,68,56,56,0,90)
  $tile.AddArc(4,68,56,56,90,90)
  $tile.CloseFigure()
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0F766E'))
  $graphics.FillPath($brush,$tile)
  $outline = [System.Drawing.Pen]::new([System.Drawing.Color]::White,7)
  $outline.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $page = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $page.AddLines([System.Drawing.PointF[]]@([System.Drawing.PointF]::new(36,29),[System.Drawing.PointF]::new(75,29),[System.Drawing.PointF]::new(92,46),[System.Drawing.PointF]::new(92,98),[System.Drawing.PointF]::new(36,98)))
  $page.CloseFigure()
  $graphics.DrawPath($outline,$page)
  $outline.Width=6
  $outline.StartCap=$outline.EndCap=[System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLines($outline,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(74,30),[System.Drawing.PointF]::new(74,48),[System.Drawing.PointF]::new(91,48)))
  $graphics.DrawLine($outline,49,61,66,61)
  $graphics.DrawLine($outline,49,75,60,75)
  $check=[System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#5EEAD4'),10)
  $check.StartCap=$check.EndCap=[System.Drawing.Drawing2D.LineCap]::Round
  $check.LineJoin=[System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($check,[System.Drawing.PointF[]]@([System.Drawing.PointF]::new(67,83),[System.Drawing.PointF]::new(77,93),[System.Drawing.PointF]::new(103,66)))
  $output=[System.Drawing.Bitmap]::new($size,$size)
  $scaled=[System.Drawing.Graphics]::FromImage($output)
  $scaled.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $scaled.DrawImage($canvas,0,0,$size,$size)
  $output.Save((Join-Path $iconDirectory "icon-$size.png"),[System.Drawing.Imaging.ImageFormat]::Png)
  $scaled.Dispose(); $output.Dispose(); $check.Dispose(); $outline.Dispose(); $page.Dispose(); $brush.Dispose(); $tile.Dispose(); $graphics.Dispose(); $canvas.Dispose()
}
