#!/usr/bin/env python3
"""
TAPO P110 Smart Plug Control Script
Called by Electron via subprocess.

Usage:
  python tapo_control.py <email> <password> <device_ip> <action>
  
Actions: on, off, status

Requires: pip install tapo
"""

import sys
import asyncio
import json

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
        # Provide helpful error messages
        if "Invalid credentials" in error_msg or "authentication" in error_msg.lower():
            error_msg = "Authentication failed - check email/password"
        elif "timeout" in error_msg.lower() or "connect" in error_msg.lower():
            error_msg = f"Cannot connect to device at {ip} - check IP and network"
        return {"success": False, "error": error_msg}

async def test_login(email: str, password: str):
    """Test if credentials are valid by attempting to create a client."""
    try:
        from tapo import ApiClient
        
        # Create client - this doesn't actually connect yet
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
        "usage": "python tapo_control.py <email> <password> <ip> <on|off|status>",
        "install": "pip install tapo"
    }

def main():
    if len(sys.argv) < 2:
        result = asyncio.run(list_help())
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
