import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, CheckCircle, XCircle, Wifi, Server, Key } from "lucide-react";
import { toast } from "sonner";

interface DiagnosticResult {
  success: boolean;
  ip: string;
  raw_probe?: {
    port_80_open: boolean;
    port_9999_open: boolean;
    http_response?: string;
    likely_device?: string;
  };
  connection_attempts?: {
    device_type: string;
    success: boolean;
    error?: string;
    firmware_version?: string;
    hardware_version?: string;
  }[];
  final_status?: string;
  likely_cause?: string;
  recommendation?: string;
  error?: string;
}

interface PlugDiagnosticsProps {
  tapoEmail: string;
  tapoPassword: string;
  isElectron: boolean;
}

export function PlugDiagnostics({ tapoEmail, tapoPassword, isElectron }: PlugDiagnosticsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ipAddress, setIpAddress] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);

  const runDiagnostic = async () => {
    if (!ipAddress.trim()) {
      toast.error("Please enter an IP address");
      return;
    }

    if (!tapoEmail || !tapoPassword) {
      toast.error("TAPO credentials not configured");
      return;
    }

    if (!isElectron || !window.electronAPI?.diagnosePlug) {
      toast.error("Diagnostics only available in Electron app");
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const response = await window.electronAPI.diagnosePlug(
        tapoEmail,
        tapoPassword,
        ipAddress.trim()
      );

      if (response) {
        setResult(response);
      } else {
        setResult({
          success: false,
          ip: ipAddress,
          error: "No response from diagnostic"
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        ip: ipAddress,
        error: err.message || "Diagnostic failed"
      });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusColor = (success: boolean) => {
    return success ? "text-green-500" : "text-red-500";
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10"
          title="Plug Diagnostics"
        >
          <AlertTriangle className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Plug Diagnostics
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Credentials Status */}
          <div className="flex items-center gap-2 text-sm">
            <Key className="h-4 w-4" />
            <span>TAPO Account:</span>
            {tapoEmail ? (
              <Badge variant="outline" className="text-green-500 border-green-500">
                {tapoEmail}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-500 border-red-500">
                Not configured
              </Badge>
            )}
          </div>

          {/* IP Input */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="diagnostic-ip" className="sr-only">IP Address</Label>
              <Input
                id="diagnostic-ip"
                placeholder="Enter plug IP (e.g., 192.168.4.75)"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                disabled={isRunning}
              />
            </div>
            <Button 
              onClick={runDiagnostic} 
              disabled={isRunning || !tapoEmail || !tapoPassword}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                "Run Diagnostic"
              )}
            </Button>
          </div>

          {/* Results */}
          {result && (
            <ScrollArea className="h-[400px] rounded-md border p-4">
              <div className="space-y-4">
                {/* Overall Status */}
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`font-medium ${getStatusColor(result.success)}`}>
                    {result.success ? "Connection Successful" : "Connection Failed"}
                  </span>
                </div>

                {/* Raw Probe Results */}
                {result.raw_probe && (
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      Network Probe
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm pl-6">
                      <div className="flex items-center gap-2">
                        <span>Port 80:</span>
                        <Badge variant={result.raw_probe.port_80_open ? "default" : "destructive"}>
                          {result.raw_probe.port_80_open ? "Open" : "Closed"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Port 9999:</span>
                        <Badge variant={result.raw_probe.port_9999_open ? "default" : "destructive"}>
                          {result.raw_probe.port_9999_open ? "Open" : "Closed"}
                        </Badge>
                      </div>
                      {result.raw_probe.likely_device && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Detected: </span>
                          <span>{result.raw_probe.likely_device}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Connection Attempts */}
                {result.connection_attempts && result.connection_attempts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Wifi className="h-4 w-4" />
                      Connection Attempts
                    </h4>
                    <div className="space-y-2 pl-6">
                      {result.connection_attempts.map((attempt, idx) => (
                        <div 
                          key={idx} 
                          className={`p-2 rounded text-sm ${
                            attempt.success 
                              ? "bg-green-500/10 border border-green-500/20" 
                              : "bg-red-500/10 border border-red-500/20"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono">{attempt.device_type}</span>
                            <Badge variant={attempt.success ? "default" : "destructive"}>
                              {attempt.success ? "✓ Success" : "✗ Failed"}
                            </Badge>
                          </div>
                          {attempt.firmware_version && (
                            <div className="text-muted-foreground mt-1">
                              FW: {attempt.firmware_version} | HW: {attempt.hardware_version}
                            </div>
                          )}
                          {attempt.error && (
                            <div className="text-red-400 mt-1 text-xs font-mono break-all">
                              {attempt.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Likely Cause & Recommendation */}
                {(result.likely_cause || result.recommendation) && (
                  <div className="space-y-2 bg-muted/50 p-3 rounded-md">
                    {result.likely_cause && (
                      <div>
                        <span className="font-medium text-yellow-500">Likely Cause: </span>
                        <span>{result.likely_cause}</span>
                      </div>
                    )}
                    {result.recommendation && (
                      <div>
                        <span className="font-medium text-blue-500">Recommendation: </span>
                        <span>{result.recommendation}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {result.error && !result.likely_cause && (
                  <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-md">
                    <span className="text-red-400 font-mono text-sm">{result.error}</span>
                  </div>
                )}

                {/* Raw JSON for debugging */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Show Raw JSON
                  </summary>
                  <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
