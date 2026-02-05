 #!/usr/bin/env node
 /**
  * This script patches the iOS AppDelegate.swift to add push notification delegate methods.
  * Run after `npx cap sync ios` or automatically via npm scripts.
  */
 
 const fs = require('fs');
 const path = require('path');
 
 const appDelegatePath = path.join(__dirname, '..', 'ios', 'App', 'App', 'AppDelegate.swift');
 
 const pushMethods = `
     // MARK: - Push Notification Delegate Methods (auto-injected)
     func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
         NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
     }
 
     func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
         NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
     }
 `;
 
 function patchAppDelegate() {
     if (!fs.existsSync(appDelegatePath)) {
         console.log('⚠️  AppDelegate.swift not found. Run "npx cap add ios" first.');
         return;
     }
 
     let content = fs.readFileSync(appDelegatePath, 'utf8');
 
     // Check if already patched
     if (content.includes('didRegisterForRemoteNotificationsWithDeviceToken')) {
         console.log('✅ AppDelegate.swift already has push notification methods.');
         return;
     }
 
     // Find the last closing brace of the class and insert before it
     const lastBraceIndex = content.lastIndexOf('}');
     if (lastBraceIndex === -1) {
         console.error('❌ Could not find class closing brace in AppDelegate.swift');
         return;
     }
 
     content = content.slice(0, lastBraceIndex) + pushMethods + '\n' + content.slice(lastBraceIndex);
 
     fs.writeFileSync(appDelegatePath, content);
     console.log('✅ Patched AppDelegate.swift with push notification delegate methods.');
 }
 
 patchAppDelegate();