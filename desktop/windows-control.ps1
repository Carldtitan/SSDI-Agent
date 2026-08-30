param(
  [Parameter(Mandatory = $true)][string]$Action,
  [Parameter(Mandatory = $true)][string]$PayloadBase64
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SSDI AgentNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool attach);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hWnd, int command);
  [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] inputs, int size);

  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;

  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion data; }
  [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; }
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort virtualKey; public ushort scanCode; public uint flags; public uint time; public IntPtr extraInfo; }

  static void Key(ushort vk, bool up) {
    var input = new INPUT { type = INPUT_KEYBOARD, data = new InputUnion { keyboard = new KEYBDINPUT { virtualKey = vk, flags = up ? KEYEVENTF_KEYUP : 0 } } };
    SendInput(1, new [] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void TypeUnicode(string value) {
    foreach (char character in value) {
      var down = new INPUT { type = INPUT_KEYBOARD, data = new InputUnion { keyboard = new KEYBDINPUT { scanCode = character, flags = KEYEVENTF_UNICODE } } };
      var up = new INPUT { type = INPUT_KEYBOARD, data = new InputUnion { keyboard = new KEYBDINPUT { scanCode = character, flags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP } } };
      SendInput(2, new [] { down, up }, Marshal.SizeOf(typeof(INPUT)));
    }
  }

  public static void PressChord(ushort[] keys, int repeats) {
    for (int repeat = 0; repeat < repeats; repeat++) {
      foreach (ushort key in keys) Key(key, false);
      for (int index = keys.Length - 1; index >= 0; index--) Key(keys[index], true);
    }
  }

  public static bool FocusWindow(IntPtr handle) {
    if (handle == IntPtr.Zero) return false;
    IntPtr foreground = GetForegroundWindow();
    uint ignored;
    uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out ignored);
    uint targetThread = GetWindowThreadProcessId(handle, out ignored);
    uint currentThread = GetCurrentThreadId();
    bool attachedTarget = targetThread != 0 && targetThread != currentThread && AttachThreadInput(currentThread, targetThread, true);
    bool attachedForeground = foregroundThread != 0 && foregroundThread != currentThread && foregroundThread != targetThread && AttachThreadInput(currentThread, foregroundThread, true);
    try {
      ShowWindowAsync(handle, 9);
      BringWindowToTop(handle);
      bool focused = SetForegroundWindow(handle);
      SetFocus(handle);
      return focused || GetForegroundWindow() == handle;
    } finally {
      if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
      if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
    }
  }
}
"@

function Decode-Payload {
  $bytes = [Convert]::FromBase64String($PayloadBase64)
  $json = [Text.Encoding]::UTF8.GetString($bytes)
  if ([string]::IsNullOrWhiteSpace($json)) { return [pscustomobject]@{} }
  return $json | ConvertFrom-Json
}

function Get-Bounds($rectangle) {
  return [ordered]@{
    x = [Math]::Round($rectangle.X)
    y = [Math]::Round($rectangle.Y)
    width = [Math]::Round([Math]::Max(0, $rectangle.Width))
    height = [Math]::Round([Math]::Max(0, $rectangle.Height))
  }
}

function Get-ActiveWindow {
  $handle = [SSDI AgentNative]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) { return $null }
  $element = [Windows.Automation.AutomationElement]::FromHandle($handle)
  $builder = New-Object Text.StringBuilder 512
  [void][SSDI AgentNative]::GetWindowText($handle, $builder, $builder.Capacity)
  [uint32]$processId = 0
  [void][SSDI AgentNative]::GetWindowThreadProcessId($handle, [ref]$processId)
  $processName = ""
  try { $processName = (Get-Process -Id $processId).ProcessName } catch {}
  return [pscustomobject]@{
    handle = $handle
    element = $element
    title = $builder.ToString()
    processName = $processName
    bounds = Get-Bounds $element.Current.BoundingRectangle
  }
}

function Get-ControlTypeName($controlType) {
  if ($null -eq $controlType) { return "Unknown" }
  return $controlType.ProgrammaticName.Replace("ControlType.", "")
}

function Get-Elements($root) {
  $results = New-Object System.Collections.Generic.List[object]
  if ($null -eq $root) { return $results }
  $walker = [Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Generic.Queue[object]
  $queue.Enqueue([pscustomobject]@{ element = $root; depth = 0 })
  while ($queue.Count -gt 0 -and $results.Count -lt 260) {
    $current = $queue.Dequeue()
    if ($current.depth -gt 5) { continue }
    $child = $walker.GetFirstChild($current.element)
    while ($null -ne $child -and $results.Count -lt 260) {
      try {
        if (-not $child.Current.IsOffscreen) {
          $name = $child.Current.Name
          $automationId = $child.Current.AutomationId
          $controlType = Get-ControlTypeName $child.Current.ControlType
          if ($name -or $automationId -or $controlType -ne "Pane") {
            $results.Add([ordered]@{
              name = [string]$name
              automationId = [string]$automationId
              controlType = [string]$controlType
              enabled = [bool]$child.Current.IsEnabled
              bounds = Get-Bounds $child.Current.BoundingRectangle
            })
          }
          $queue.Enqueue([pscustomobject]@{ element = $child; depth = $current.depth + 1 })
        }
      } catch {}
      try { $child = $walker.GetNextSibling($child) } catch { $child = $null }
    }
  }
  return $results
}

function Find-Element($root, $selector) {
  if ($null -eq $root) { return $null }

  # Automation IDs are more stable than accessible names in File Explorer.
  # Explorer changes labels such as "Search Home" after navigation or focus.
  if ($selector.automationId) {
    $idCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::AutomationIdProperty, [string]$selector.automationId)
    $idMatches = $root.FindAll([Windows.Automation.TreeScope]::Descendants, $idCondition)
    foreach ($match in $idMatches) {
      try {
        if (-not $selector.controlType -or (Get-ControlTypeName $match.Current.ControlType) -eq [string]$selector.controlType) {
          return $match
        }
      } catch {}
    }
  }

  if ($selector.name) {
    $nameCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::NameProperty, [string]$selector.name)
    $nameMatches = $root.FindAll([Windows.Automation.TreeScope]::Descendants, $nameCondition)
    foreach ($match in $nameMatches) {
      try {
        if (-not $selector.controlType -or (Get-ControlTypeName $match.Current.ControlType) -eq [string]$selector.controlType) {
          return $match
        }
      } catch {}
    }

    $wantedName = ([string]$selector.name).Trim()
    $allControls = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
    foreach ($match in $allControls) {
      try {
        $sameType = -not $selector.controlType -or (Get-ControlTypeName $match.Current.ControlType) -eq [string]$selector.controlType
        if ($sameType -and $match.Current.Name.Trim() -eq $wantedName) { return $match }
      } catch {}
    }
  }
  return $null
}

function Invoke-Element($element) {
  if ($null -eq $element) { throw "The Windows control is no longer available." }
  if ($element.Current.ControlType -eq [Windows.Automation.ControlType]::Edit) {
    $element.SetFocus()
    return
  }
  $pattern = $null
  if ($element.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
  if ($element.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) { $pattern.Select(); return }
  if ($element.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) { $pattern.Expand(); return }
  $bounds = $element.Current.BoundingRectangle
  [SSDI AgentNative]::SetCursorPos([int]($bounds.X + $bounds.Width / 2), [int]($bounds.Y + $bounds.Height / 2)) | Out-Null
  [SSDI AgentNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [SSDI AgentNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

function Key-Code($name) {
  $codes = @{
    ALT=0x12; BACKSPACE=0x08; CTRL=0x11; DELETE=0x2E; DOWN=0x28; END=0x23; ENTER=0x0D;
    ESCAPE=0x1B; F4=0x73; HOME=0x24; LEFT=0x25; RIGHT=0x27; SHIFT=0x10; SPACE=0x20;
    TAB=0x09; UP=0x26; WIN=0x5B; A=0x41; C=0x43; F=0x46; L=0x4C; V=0x56
  }
  if (-not $codes.ContainsKey($name)) { throw "Unsupported key." }
  return [uint16]$codes[$name]
}

function Focus-AutomationWindow($element) {
  if ($null -eq $element) { throw "That window is not open." }
  $handle = [IntPtr]$element.Current.NativeWindowHandle
  if ($handle -ne [IntPtr]::Zero -and [SSDI AgentNative]::FocusWindow($handle)) {
    return
  }
  $windowActivator = New-Object -ComObject WScript.Shell
  if ($windowActivator.AppActivate([int]$element.Current.ProcessId)) { return }
  try { $element.SetFocus(); return } catch {}
  throw "Windows could not focus that window."
}

function Get-ObservationResult {
  $window = Get-ActiveWindow
  return [ordered]@{
    activeWindow = [ordered]@{
      title = if ($window) { $window.title } else { "Windows desktop" }
      processName = if ($window) { $window.processName } else { "" }
      bounds = if ($window) { $window.bounds } else { [ordered]@{ x=0; y=0; width=0; height=0 } }
    }
    elements = if ($window) { @(Get-Elements $window.element) } else { @() }
  }
}

function Perform-ComputerAction($tool, $args) {
  $current = Get-ActiveWindow
  if ($tool -ne "focus_window" -and $args.windowTitle -and $current.title -ne $args.windowTitle) {
    $root = [Windows.Automation.AutomationElement]::RootElement
    $windowCondition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
    $openWindows = $root.FindAll([Windows.Automation.TreeScope]::Children, $windowCondition)
    $targetWindow = $openWindows | Where-Object { $_.Current.Name -eq [string]$args.windowTitle } | Select-Object -First 1
    if (-not $targetWindow) {
      $targetWindow = $openWindows | Where-Object { $_.Current.Name -like "*$($args.windowTitle)*" } | Select-Object -First 1
    }
    if ($targetWindow) {
      Focus-AutomationWindow $targetWindow
      Start-Sleep -Milliseconds 120
      $current = Get-ActiveWindow
    }
  }
  switch ($tool) {
    "focus_window" {
      $root = [Windows.Automation.AutomationElement]::RootElement
      $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
      $windows = $root.FindAll([Windows.Automation.TreeScope]::Children, $condition)
      $match = $windows | Where-Object { $_.Current.Name -like "*$($args.title)*" } | Select-Object -First 1
      if (-not $match) { throw "That window is not open." }
      Focus-AutomationWindow $match
    }
    "invoke_element" {
      if (-not $current) { throw "No active window is available." }
      Invoke-Element (Find-Element $current.element $args.selector)
    }
    "click" {
      [SSDI AgentNative]::SetCursorPos([int]$args.x, [int]$args.y) | Out-Null
      [SSDI AgentNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [SSDI AgentNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
    "type_text" {
      $focused = [Windows.Automation.AutomationElement]::FocusedElement
      $valuePattern = $null
      if (
        $null -ne $focused -and
        $focused.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern) -and
        -not $valuePattern.Current.IsReadOnly
      ) {
        $valuePattern.SetValue([string]$args.text)
      } else {
        [SSDI AgentNative]::TypeUnicode([string]$args.text)
      }
    }
    "press_keys" {
      [uint16[]]$keys = @($args.keys | ForEach-Object { Key-Code ([string]$_) })
      [SSDI AgentNative]::PressChord($keys, [int]$args.repeats)
    }
    "scroll" {
      $delta = if ($args.direction -eq "up") { 120 * [int]$args.amount } else { -120 * [int]$args.amount }
      [SSDI AgentNative]::mouse_event(0x0800, 0, 0, $delta, [UIntPtr]::Zero)
    }
    default { throw "Unsupported Windows action." }
  }
}

$payload = Decode-Payload
$active = Get-ActiveWindow

switch ($Action) {
  "Observe" {
    $result = Get-ObservationResult
  }
  "ActAndObserve" {
    Perform-ComputerAction $payload.tool $payload.args
    Start-Sleep -Milliseconds 180
    $result = Get-ObservationResult
  }
  "FocusWindow" {
    $root = [Windows.Automation.AutomationElement]::RootElement
    $condition = New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
    $windows = $root.FindAll([Windows.Automation.TreeScope]::Children, $condition)
    $match = $windows | Where-Object { $_.Current.Name -like "*$($payload.title)*" } | Select-Object -First 1
    if (-not $match) { throw "That window is not open." }
    Focus-AutomationWindow $match
    $result = @{ ok = $true }
  }
  "InvokeElement" {
    if (-not $active) { throw "No active window is available." }
    Invoke-Element (Find-Element $active.element $payload.selector)
    $result = @{ ok = $true }
  }
  "Click" {
    [SSDI AgentNative]::SetCursorPos([int]$payload.x, [int]$payload.y) | Out-Null
    [SSDI AgentNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [SSDI AgentNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    $result = @{ ok = $true }
  }
  "TypeText" {
    $focused = [Windows.Automation.AutomationElement]::FocusedElement
    $valuePattern = $null
    if (
      $null -ne $focused -and
      $focused.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern) -and
      -not $valuePattern.Current.IsReadOnly
    ) {
      $valuePattern.SetValue([string]$payload.text)
    } else {
      [SSDI AgentNative]::TypeUnicode([string]$payload.text)
    }
    $result = @{ ok = $true }
  }
  "PressKeys" {
    [uint16[]]$keys = @($payload.keys | ForEach-Object { Key-Code ([string]$_) })
    [SSDI AgentNative]::PressChord($keys, [int]$payload.repeats)
    $result = @{ ok = $true }
  }
  "Scroll" {
    $delta = if ($payload.direction -eq "up") { 120 * [int]$payload.amount } else { -120 * [int]$payload.amount }
    [SSDI AgentNative]::mouse_event(0x0800, 0, 0, $delta, [UIntPtr]::Zero)
    $result = @{ ok = $true }
  }
  "SelectedFiles" {
    $paths = @()
    $shellApplication = New-Object -ComObject Shell.Application
    foreach ($window in $shellApplication.Windows()) {
      try {
        if ([IntPtr]$window.HWND -eq $active.handle) {
          foreach ($item in $window.Document.SelectedItems()) { $paths += [string]$item.Path }
          break
        }
      } catch {}
    }
    $result = @{ paths = $paths }
  }
  default { throw "Unsupported Windows action." }
}

$result | ConvertTo-Json -Depth 8 -Compress
