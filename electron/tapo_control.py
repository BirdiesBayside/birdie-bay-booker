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
SCRIPT_VERSION = "2026-01-17-1"


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
            return device, info, device_type, attempts

        except Exception as e:
            attempts.append({"type": device_type, "error": str(e)})

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

async def list_help():
    """Show help information."""
    return {
        "success": True,
        "usage": {
            "control": "tapo_control.exe <email> <password> <ip> <on|off|status>",
            "scan": "tapo_control.exe --scan <email> <password>"
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
