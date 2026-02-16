import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  FolderOpen, 
  Upload, 
  Check, 
  X, 
  RefreshCw, 
  FileText,
  AlertTriangle,
  Play,
  Monitor
} from "lucide-react";
import { toast } from "sonner";
import "@/types/electron.d";

interface BaselineConfig {
  gsproFolderPath: string;
  dpsFilePath: string;
  settingsFilePath: string;
  enabled: boolean;
  hasDpsFile: boolean;
  hasSettingsFile: boolean;
  isWatching: boolean;
  proteeDisplayLabel: string;
  proteeScreenId: string;
}

interface DisplayDevice {
  label: string;
  devicePath: string;
}

interface AppRestoreSettingsProps {
  isElectron: boolean;
}

export function AppRestoreSettings({ isElectron }: AppRestoreSettingsProps) {
  const [config, setConfig] = useState<BaselineConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [gsproRunning, setGsproRunning] = useState(false);

  // Protee display state
  const [displayDevices, setDisplayDevices] = useState<DisplayDevice[]>([]);
  const [isLoadingDisplays, setIsLoadingDisplays] = useState(false);
  const [currentProteeScreen, setCurrentProteeScreen] = useState<string>("");
  const [isReadingConfig, setIsReadingConfig] = useState(false);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [isElectron]);

  // Listen for GSPro events
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    const cleanupClosed = window.electronAPI.onGsproClosed(() => {
      toast.info("GSPro closed - restoring app settings...");
      setGsproRunning(false);
    });

    const cleanupRestored = window.electronAPI.onBaselineRestored((results) => {
      const allSuccess = results.every(r => r.success);
      if (allSuccess) {
        toast.success("App settings restored successfully!");
      } else {
        const failed = results.filter(r => !r.success);
        toast.warning(`Some items failed to restore: ${failed.map(f => f.file).join(', ')}`);
      }
      loadConfig();
    });

    // Check GSPro status periodically
    const checkInterval = setInterval(async () => {
      if (window.electronAPI) {
        const { isRunning } = await window.electronAPI.isGsproRunning();
        setGsproRunning(isRunning);
      }
    }, 5000);

    return () => {
      cleanupClosed?.();
      cleanupRestored?.();
      clearInterval(checkInterval);
    };
  }, [isElectron]);

  const loadConfig = async () => {
    if (!isElectron || !window.electronAPI) {
      setIsLoading(false);
      return;
    }

    try {
      const cfg = await window.electronAPI.getBaselineConfig();
      setConfig(cfg);
      
      const { isRunning } = await window.electronAPI.isGsproRunning();
      setGsproRunning(isRunning);

      // Load display devices
      refreshDisplays();
      
      // Read current Protee config
      readCurrentScreen();
    } catch (err) {
      console.error("Failed to load baseline config:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDisplays = async () => {
    if (!window.electronAPI) return;
    setIsLoadingDisplays(true);
    try {
      const devices = await window.electronAPI.getDisplayDevicePaths();
      setDisplayDevices(devices);
    } catch (err) {
      console.error("Failed to get display devices:", err);
    } finally {
      setIsLoadingDisplays(false);
    }
  };

  const readCurrentScreen = async () => {
    if (!window.electronAPI) return;
    setIsReadingConfig(true);
    try {
      const result = await window.electronAPI.readProteeCurrentScreen();
      if (result.success) {
        setCurrentProteeScreen(result.currentScreen || "");
      }
    } catch (err) {
      console.error("Failed to read Protee config:", err);
    } finally {
      setIsReadingConfig(false);
    }
  };

  const selectProteeDisplay = async (label: string) => {
    if (!window.electronAPI) return;
    
    const device = displayDevices.find(d => d.label === label);
    if (!device) return;

    const result = await window.electronAPI.setProteeDisplay(device.label, device.devicePath);
    if (result.success) {
      toast.success(`Protee display set to: ${label}`);
      loadConfig();
    }
  };

  const browseGsproFolder = async () => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseGsproFolder();
    if (result.success) {
      toast.success(`GSPro folder set: ${result.folderPath}`);
      loadConfig();
    } else if (!result.canceled) {
      toast.error(`Failed to set folder: ${result.error}`);
    }
  };

  const browseBaselineFile = async (fileName: string) => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.browseBaselineFile(fileName);
    if (result.success) {
      toast.success(`Uploaded ${fileName} baseline`);
      loadConfig();
    } else if (!result.canceled) {
      toast.error(`Failed to upload: ${result.error}`);
    }
  };

  const toggleEnabled = async (enabled: boolean) => {
    if (!window.electronAPI) return;

    const result = await window.electronAPI.setBaselineEnabled(enabled);
    if (result.success) {
      toast.success(enabled ? "App restore enabled" : "App restore disabled");
      loadConfig();
    }
  };

  const restoreNow = async () => {
    if (!window.electronAPI) return;

    setIsRestoring(true);
    try {
      const result = await window.electronAPI.restoreBaselineNow();
      if (result.success) {
        const allSuccess = result.results?.every(r => r.success);
        if (allSuccess) {
          toast.success("App settings restored!");
        } else {
          const failed = result.results?.filter(r => !r.success) || [];
          toast.warning(`Some items failed: ${failed.map(f => f.file).join(', ')}`);
        }
      } else {
        toast.error(`Restore failed: ${result.error}`);
      }
      // Re-read current protee screen after restore
      readCurrentScreen();
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isElectron) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-lg">
        <p>App restore settings require the desktop app.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading app restore settings...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* GSPro Status */}
      <div className="flex items-center justify-between">
        <Label>GSPro Status</Label>
        <Badge variant={gsproRunning ? "default" : "secondary"}>
          {gsproRunning ? (
            <><Play className="h-3 w-3 mr-1" /> Running</>
          ) : (
            "Not Running"
          )}
        </Badge>
      </div>

      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <Label>Auto-Restore on GSPro Close</Label>
          <p className="text-xs text-muted-foreground">
            Automatically restore GSPro &amp; Protee settings when GSPro exits
          </p>
        </div>
        <Switch
          checked={config?.enabled || false}
          onCheckedChange={toggleEnabled}
        />
      </div>

      {config?.isWatching && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-500/10 p-2 rounded">
          <Check className="h-4 w-4" />
          Process watcher active - monitoring GSPro
        </div>
      )}

      <Separator />

      {/* ===== PROTEE LABS MONITOR SECTION ===== */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          <Label className="text-base font-semibold">Protee Labs Monitor</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Select the correct display for Protee Labs. On session close, the config will be patched to ensure it always opens on this monitor.
        </p>

        {/* Display dropdown */}
        <div className="space-y-2">
          <Label>Target Display</Label>
          <div className="flex gap-2">
            <Select
              value={config?.proteeDisplayLabel || ""}
              onValueChange={selectProteeDisplay}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a display..." />
              </SelectTrigger>
              <SelectContent>
                {displayDevices.map(d => (
                  <SelectItem key={d.devicePath} value={d.label}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={refreshDisplays} disabled={isLoadingDisplays}>
              <RefreshCw className={`h-4 w-4 ${isLoadingDisplays ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Current config status */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">Configured Display</p>
              <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                {config?.proteeDisplayLabel || "Not configured"}
              </p>
            </div>
          </div>
          {config?.proteeScreenId ? (
            <Badge variant="secondary" className="text-green-600 bg-green-500/10">
              <Check className="h-3 w-3 mr-1" /> Set
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10">
              <AlertTriangle className="h-3 w-3 mr-1" /> Not Set
            </Badge>
          )}
        </div>

        {/* Live Protee config value */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Live Config Value</p>
            <p className="text-xs text-muted-foreground truncate">
              {isReadingConfig ? "Reading..." : (currentProteeScreen || "Not found")}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={readCurrentScreen} disabled={isReadingConfig}>
            <RefreshCw className={`h-4 w-4 ${isReadingConfig ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Separator />

      {/* ===== GSPRO BASELINE FILES SECTION ===== */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <Label className="text-base font-semibold">GSPro Baseline Files</Label>
        </div>

        {/* GSPro Folder */}
        <div className="space-y-2">
          <Label>GSPro Data Folder</Label>
          <div className="flex gap-2">
            <Input
              value={config?.gsproFolderPath || ''}
              readOnly
              placeholder="Not set - click Browse to select"
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={browseGsproFolder}>
              <FolderOpen className="h-4 w-4 mr-1" />
              Browse
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Usually: C:\Users\[User]\AppData\Local\GSPro
          </p>
        </div>

        {/* Baseline Files */}
        <div className="space-y-3">
          {/* dpsV2x3.gss */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">dpsV2x3.gss</p>
                <p className="text-xs text-muted-foreground">Driver/Club settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.hasDpsFile ? (
                <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                  <Check className="h-3 w-3 mr-1" /> Uploaded
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Not Set
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => browseBaselineFile('dpsV2x3.gss')}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>

          {/* Settings.vgs */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="font-medium text-sm">Settings.vgs</p>
                <p className="text-xs text-muted-foreground">General GSPro settings</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {config?.hasSettingsFile ? (
                <Badge variant="secondary" className="text-green-600 bg-green-500/10">
                  <Check className="h-3 w-3 mr-1" /> Uploaded
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-yellow-600 bg-yellow-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Not Set
                </Badge>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => browseBaselineFile('Settings.vgs')}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Restore Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={restoreNow}
        disabled={isRestoring || (!config?.hasDpsFile && !config?.hasSettingsFile && !config?.proteeScreenId)}
      >
        {isRestoring ? (
          <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Restoring...</>
        ) : (
          <><RefreshCw className="h-4 w-4 mr-2" /> Restore Now</>
        )}
      </Button>

      {/* Info */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg space-y-1">
        <p><strong>How it works:</strong></p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Select the correct Protee Labs display above</li>
          <li>Set up GSPro with your preferred settings + Guest players</li>
          <li>Upload the two GSPro config files</li>
          <li>Enable auto-restore</li>
          <li>When GSPro closes, settings &amp; Protee config are reset automatically</li>
        </ol>
      </div>
    </div>
  );
}
