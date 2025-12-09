#!/usr/bin/env python3
"""
TAPO P110 Smart Plug Control Script
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

async def control_plug(email: str, password: str, ip: str, action: str):
    try:
        from tapo import ApiClient
        
        client = ApiClient(email, password)
        device = await client.p110(ip)
        
        if action == "on":
            await device.on()
            return {"success": True, "action": "on"}
        elif action == "off":
            await device.off()
            return {"success": True, "action": "off"}
        elif action == "status":
            info = await device.get_device_info()
            return {"success": True, "isOn": info.device_on}
        else:
            return {"success": False, "error": f"Unknown action: {action}"}
            
    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}
    except Exception as e:
        error_msg = str(e)
        if "Invalid credentials" in error_msg or "authentication" in error_msg.lower():
            error_msg = "Authentication failed - check email/password"
        elif "timeout" in error_msg.lower() or "connect" in error_msg.lower():
            error_msg = f"Cannot connect to device at {ip} - check IP and network"
        return {"success": False, "error": error_msg}

async def scan_network(email: str, password: str):
    """Scan local network for TAPO devices."""
    try:
        from tapo import ApiClient
        
        # Get local IP to determine network range
        local_ip = get_local_ip()
        if not local_ip:
            return {"success": False, "error": "Could not determine local IP address"}
        
        # Calculate network range (assuming /24 subnet)
        ip_parts = local_ip.split('.')
        network_prefix = '.'.join(ip_parts[:3])
        
        client = ApiClient(email, password)
        found_devices = []
        
        # Scan common IP range (1-254)
        tasks = []
        for i in range(1, 255):
            ip = f"{network_prefix}.{i}"
            tasks.append(check_tapo_device(client, ip))
        
        # Run scans concurrently with timeout
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, dict) and result.get("found"):
                found_devices.append(result)
        
        return {
            "success": True,
            "network": f"{network_prefix}.0/24",
            "scanned": 254,
            "plugs": found_devices
        }
        
    except ImportError:
        return {"success": False, "error": "tapo package not installed. Run: pip install tapo"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def check_tapo_device(client, ip: str):
    """Check if a specific IP is a TAPO device."""
    try:
        # Quick port check first (TAPO uses port 80)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.3)
        result = sock.connect_ex((ip, 80))
        sock.close()
        
        if result != 0:
            return {"found": False}
        
        # Try to connect as P110
        device = await asyncio.wait_for(
            client.p110(ip),
            timeout=2.0
        )
        info = await asyncio.wait_for(
            device.get_device_info(),
            timeout=2.0
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
