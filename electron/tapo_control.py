#!/usr/bin/env python3
"""
TAPO Smart Plug Control Script (P100/P105/P110/P115)
Called by Electron via subprocess (compiled to .exe via PyInstaller).

Usage:
  tapo_control.exe <email> <password> <device_ip> <action>
  tapo_control.exe --scan <email> <password>

Actions: on, off, status
Scan: Discovers TAPO devices on local network

Requires: pip install tapo
"""

import sys
import asyncio
import json
import socket
import struct
from typing import Any, Dict, List, Optional, Tuple

DEVICE_TYPES = ["p100", "p110", "p105", "p115"]
SCRIPT_VERSION = "2026-01-17-2"


async def probe_device_raw(ip: str) -> Dict[str, Any]:
    """
    Probe a device at IP without authentication to get basic info.
    This helps diagnose if the device is a Tapo plug vs something else.
    """
    result = {
        "ip": ip,
        "port_80_open": check_port_open(ip, 80, timeout=1.0),
        "port_9999_open": check_port_open(ip, 9999, timeout=1.0),  # Old Kasa protocol
        "http_response": None,
        "device_type_guess": None
    }
    
    # Try to get HTTP response to identify device
    if result["port_80_open"]:
        try:
            import urllib.request
            import urllib.error
            req = urllib.request.Request(
                f"http://{ip}/",
                headers={"User-Agent": "TapoProbe/1.0"}
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                result["http_response"] = resp.read(500).decode('utf-8', errors='ignore')[:200]
        except urllib.error.HTTPError as e:
            result["http_response"] = f"HTTP {e.code}"
        except Exception as e:
            result["http_response"] = f"Error: {str(e)[:100]}"
    
    # Guess device type based on responses
    if result["port_9999_open"]:
        result["device_type_guess"] = "Old Kasa/Tapo (port 9999)"
    elif result["port_80_open"]:
        http_resp = (result["http_response"] or "").lower()
        if "tapo" in http_resp or "tp-link" in http_resp:
            result["device_type_guess"] = "Tapo device (HTTP)"
        elif "404" in str(result["http_response"]) or "HTTP 4" in str(result["http_response"]):
            result["device_type_guess"] = "Possible Tapo (HTTP 4xx)"
        else:
            result["device_type_guess"] = "Unknown HTTP device"
    else:
        result["device_type_guess"] = "No common ports open"
    
    return result


def _get_tapo_version() -> Optional[str]:
    try:
        from importlib.metadata import version

        return version("tapo")
    except Exception:
        return None


async def connect_any(client, ip: str) -> Tuple[Optional[Any], Optional[Any], Optional[str], List[Dict[str, str]]]:
    """Try supported device types and return the first one that responds."""
    attempts: List[Dict[str, str]] = []

    for device_type in DEVICE_TYPES:
        try:
            device_method = getattr(client, device_type, None)
            if device_method is None:
                attempts.append({"type": device_type, "error": "Unsupported by library"})
                continue

            device = await device_method(ip)
            info = await device.get_device_info()
            
            # Extract firmware info for diagnostics
            fw_ver = getattr(info, 'fw_ver', None) or getattr(info, 'firmware_version', None)
            hw_ver = getattr(info, 'hw_ver', None) or getattr(info, 'hardware_version', None)
            
            attempts.append({
                "type": device_type, 
                "success": True,
                "firmware": fw_ver,
                "hardware": hw_ver
            })
            return device, info, device_type, attempts

        except Exception as e:
            error_str = str(e)
            # Add more context to KLAP errors
            if "klap" in error_str.lower():
                error_str = f"KLAP auth failed (firmware may be too new): {error_str}"
            attempts.append({"type": device_type, "error": error_str})

    return None, None, None, attempts


def classify_error(raw: str, ip: str) -> Tuple[str, bool]:
    lower = (raw or "").lower()

    if "auth" in lower or "credential" in lower or "unauthorized" in lower:
        return f"Authentication failed for {ip}: {raw}", True

    if "timeout" in lower:
        return f"Timeout talking to {ip}: {raw}", True

    if "connect" in lower or "unreachable" in lower or "refused" in lower:
        return f"Connection failed to {ip}: {raw}", True

    if "klap" in lower:
        return f"KLAP handshake failed for {ip}: {raw}", True

    return raw or "Unknown error", False


async def control_plug(email: str, password: str, ip: str, action: str):
    try:
        from tapo import ApiClient

        client = ApiClient(email, password)

        device, info, connected_as, attempts = await connect_any(client, ip)
        if device is None:
            raw = attempts[-1]["error"] if attempts else "Could not connect to device"
            msg, retryable = classify_error(raw, ip)
            return {
                "success": False,
                "error": msg,
                "retryable": retryable,
                "debug": {
                    "script_version": SCRIPT_VERSION,
                    "tapo_version": _get_tapo_version(),
                    "attempts": attempts,
                },
            }

        if action == "on":
            await device.on()
        elif action == "off":
            await device.off()
        elif action == "status":
            pass
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

        # Verify state (also confirms the session is still valid)
        info_after = await device.get_device_info()

        return {
            "success": True,
            "action": action,
            "isOn": getattr(info_after, "device_on", None),
            "connected_as": connected_as,
            "model": getattr(info_after, "model", None) or getattr(info, "model", None),
            "script_version": SCRIPT_VERSION,
        }

    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}

    except Exception as e:
        raw = str(e)
        msg, retryable = classify_error(raw, ip)
        return {
            "success": False,
            "error": msg,
            "retryable": retryable,
            "debug": {
                "script_version": SCRIPT_VERSION,
                "tapo_version": _get_tapo_version(),
                "raw_error": raw,
            },
        }


async def scan_network(email: str, password: str):
    """Scan subnets 1-10 for TAPO devices using direct device probing."""
    try:
        from tapo import ApiClient

        # Get local IP to determine base network (e.g., 192.168.x.x)
        local_ip = get_local_ip()
        if not local_ip:
            return {"success": False, "error": "Could not determine local IP address"}

        # Get base network (first two octets, e.g., "192.168")
        ip_parts = local_ip.split('.')
        base_network = '.'.join(ip_parts[:2])

        found_devices = []
        total_open_ports = 0
        subnets_scanned = []

        # Create client once for the scan
        client = ApiClient(email, password)

        # Scan subnets 1-10, starting from 1
        for subnet in range(1, 11):
            network_prefix = f"{base_network}.{subnet}"
            subnets_scanned.append(f"{network_prefix}.0/24")

            # Find all IPs with port 80 open (many TAPO devices expose a local HTTP port)
            open_ips = []
            for i in range(1, 255):
                ip = f"{network_prefix}.{i}"
                if check_port_open(ip, 80, timeout=0.3):
                    open_ips.append(ip)

            total_open_ports += len(open_ips)

            # Try to connect to each open IP as a TAPO device
            for ip in open_ips:
                try:
                    device, info, connected_as, _attempts = await connect_any(client, ip)
                    if device is None or info is None:
                        continue

                    found_devices.append({
                        "found": True,
                        "ip": ip,
                        "nickname": getattr(info, 'nickname', 'Unknown'),
                        "model": getattr(info, 'model', None) or (connected_as.upper() if connected_as else None),
                        "isOn": getattr(info, 'device_on', False),
                        "connected_as": connected_as,
                    })
                except Exception:
                    continue

        return {
            "success": True,
            "script_version": SCRIPT_VERSION,
            "tapo_version": _get_tapo_version(),
            "networks": subnets_scanned,
            "scanned": 254 * 10,  # 10 subnets x 254 IPs
            "open_ports": total_open_ports,
            "plugs": found_devices,
        }

    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}

    except Exception as e:
        return {"success": False, "error": str(e)}

        
    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def check_port_open(ip: str, port: int, timeout: float = 0.5) -> bool:
    """Check if a port is open on an IP address."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return result == 0
    except Exception:
        return False

async def check_tapo_device(client, ip: str):
    """Check if a specific IP is a TAPO device."""
    try:
        # Try to connect as P110 with longer timeout
        device = await asyncio.wait_for(
            client.p110(ip),
            timeout=5.0
        )
        info = await asyncio.wait_for(
            device.get_device_info(),
            timeout=5.0
        )
        
        return {
            "found": True,
            "ip": ip,
            "nickname": getattr(info, 'nickname', 'Unknown'),
            "model": getattr(info, 'model', 'P110'),
            "isOn": getattr(info, 'device_on', False)
        }
    except asyncio.TimeoutError:
        return {"found": False}
    except Exception:
        return {"found": False}

def get_local_ip():
    """Get the local IP address of this machine."""
    try:
        # Create a socket to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return None

async def test_login(email: str, password: str):
    """Test if credentials are valid by attempting to create a client."""
    try:
        from tapo import ApiClient
        
        client = ApiClient(email, password)
        return {"success": True, "message": "Credentials format valid. Test with a device IP to verify."}
        
    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def diagnose_device(email: str, password: str, ip: str):
    """
    Run comprehensive diagnostics on a specific IP to determine why connection fails.
    This is useful when plugs work in the Tapo app but not via our script.
    """
    result = {
        "success": True,
        "ip": ip,
        "script_version": SCRIPT_VERSION,
        "tapo_version": _get_tapo_version(),
        "diagnostics": {}
    }
    
    # Step 1: Raw probe without auth
    result["diagnostics"]["raw_probe"] = await probe_device_raw(ip)
    
    # Step 2: Try to connect with auth
    try:
        from tapo import ApiClient
        client = ApiClient(email, password)
        
        device, info, connected_as, attempts = await connect_any(client, ip)
        
        result["diagnostics"]["connection_attempts"] = attempts
        
        if device is not None and info is not None:
            result["diagnostics"]["connected"] = True
            result["diagnostics"]["connected_as"] = connected_as
            result["diagnostics"]["device_info"] = {
                "nickname": getattr(info, 'nickname', None),
                "model": getattr(info, 'model', None),
                "firmware": getattr(info, 'fw_ver', None) or getattr(info, 'firmware_version', None),
                "hardware": getattr(info, 'hw_ver', None) or getattr(info, 'hardware_version', None),
                "mac": getattr(info, 'mac', None),
                "device_on": getattr(info, 'device_on', None),
            }
        else:
            result["diagnostics"]["connected"] = False
            # Analyze the failure
            all_errors = [a.get("error", "") for a in attempts if a.get("error")]
            
            if any("klap" in e.lower() for e in all_errors):
                result["diagnostics"]["likely_cause"] = "KLAP_HANDSHAKE_FAILED"
                result["diagnostics"]["explanation"] = (
                    "The plug uses KLAP protocol but handshake failed. "
                    "This usually means: (1) Wrong credentials, (2) Plug not linked to this Tapo account, "
                    "or (3) Firmware version incompatible with tapo library. "
                    "Try updating the tapo Python package: pip install --upgrade tapo"
                )
            elif any("timeout" in e.lower() for e in all_errors):
                result["diagnostics"]["likely_cause"] = "TIMEOUT"
                result["diagnostics"]["explanation"] = (
                    "Connection timed out. Device may be offline, IP may be wrong, "
                    "or firewall may be blocking."
                )
            elif any("auth" in e.lower() or "credential" in e.lower() for e in all_errors):
                result["diagnostics"]["likely_cause"] = "AUTH_FAILED"
                result["diagnostics"]["explanation"] = (
                    "Authentication failed. Verify the email/password match exactly what's in the Tapo app. "
                    "Also ensure the plug is registered to this same Tapo account."
                )
            else:
                result["diagnostics"]["likely_cause"] = "UNKNOWN"
                result["diagnostics"]["explanation"] = "Unable to determine cause. Check raw errors above."
                
    except ImportError:
        result["success"] = False
        result["error"] = "tapo package not installed"
    except Exception as e:
        result["diagnostics"]["exception"] = str(e)
    
    return result


async def list_help():
    """Show help information."""
    return {
        "success": True,
        "usage": {
            "control": "tapo_control.exe <email> <password> <ip> <on|off|status>",
            "scan": "tapo_control.exe --scan <email> <password>",
            "diagnose": "tapo_control.exe --diagnose <email> <password> <ip>"
        }
    }

def main():
    if len(sys.argv) < 2:
        result = asyncio.run(list_help())
        print(json.dumps(result))
        return
    
    # Handle --scan command
    if sys.argv[1] == "--scan":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: --scan <email> <password>"}))
            return
        result = asyncio.run(scan_network(sys.argv[2], sys.argv[3]))
        print(json.dumps(result))
        return
    
    if sys.argv[1] == "--test-login":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: --test-login <email> <password>"}))
            return
        result = asyncio.run(test_login(sys.argv[2], sys.argv[3]))
        print(json.dumps(result))
        return
    
    # Handle --diagnose command
    if sys.argv[1] == "--diagnose":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "error": "Usage: --diagnose <email> <password> <ip>"}))
            return
        result = asyncio.run(diagnose_device(sys.argv[2], sys.argv[3], sys.argv[4]))
        print(json.dumps(result, indent=2))
        return
    
    if len(sys.argv) < 5:
        print(json.dumps({"success": False, "error": "Usage: <email> <password> <ip> <on|off|status>"}))
        return
    
    email = sys.argv[1]
    password = sys.argv[2]
    ip = sys.argv[3]
    action = sys.argv[4].lower()
    
    result = asyncio.run(control_plug(email, password, ip, action))
    print(json.dumps(result))

if __name__ == "__main__":
    main()
