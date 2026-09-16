//
//  SafariWebExtensionHandler.swift
//  MaskFill Extension
//
//  Safari requires a native handler class to exist, but the extension no longer
//  has anything for it to do: the password is taken from the user's password
//  manager in the popup, used once, and dropped. Nothing is persisted, so
//  nothing here needs Keychain access -- or any entitlement beyond the default.
//
//  If a message ever does need native code, this is where it lands.
//

import SafariServices
import os.log

private let logger = Logger(
    subsystem: "com.example.MaskFill.Extension",
    category: "native"
)

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey]

        logger.debug("Unexpected native message: \(String(describing: message), privacy: .public)")

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: ["error": "No native actions are supported."]]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
