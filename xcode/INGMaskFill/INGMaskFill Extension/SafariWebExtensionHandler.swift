//
//  SafariWebExtensionHandler.swift
//  INGMaskFill Extension
//
//  Native half of the extension. This is the only component that can read the
//  stored password, and it never hands the whole thing back to JavaScript --
//  the "chars" action returns just the characters at the requested positions.
//

import SafariServices
import Security
import os.log

private let keychainService = "INGMaskFill"
private let keychainAccount = "moje-ing"

private let logger = Logger(
    subsystem: "com.example.INGMaskFill.Extension",
    category: "native"
)

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let item = context.inputItems.first as? NSExtensionItem
        let message = item?.userInfo?[SFExtensionMessageKey] as? [String: Any]

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: handle(message)]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func handle(_ message: [String: Any]?) -> [String: Any] {
        guard let action = message?["action"] as? String else {
            return ["error": "Missing action."]
        }

        do {
            switch action {
            case "status":
                return try status()

            case "save":
                guard let password = message?["password"] as? String,
                      !password.isEmpty else {
                    return ["error": "Missing password."]
                }
                try Keychain.save(password)
                return try status()

            case "delete":
                try Keychain.delete()
                return try status()

            case "chars":
                guard let positions = message?["positions"] as? [Int] else {
                    return ["error": "Missing positions."]
                }
                return try chars(at: positions)

            default:
                return ["error": "Unknown action: \(action)"]
            }
        } catch {
            // Log the failure, never the secret.
            logger.error("action \(action, privacy: .public) failed: \(error, privacy: .public)")
            return ["error": String(describing: error)]
        }
    }

    private func status() throws -> [String: Any] {
        guard let password = try Keychain.load() else {
            return ["stored": false, "length": 0]
        }
        return ["stored": true, "length": password.count]
    }

    private func chars(at positions: [Int]) throws -> [String: Any] {
        guard let password = try Keychain.load() else {
            throw HandlerError.noPassword
        }

        let characters = Array(password)
        var result: [String: String] = [:]

        for position in positions {
            guard position >= 1, position <= characters.count else {
                throw HandlerError.positionOutOfRange(position, characters.count)
            }
            // Keys are strings so the dictionary survives the trip to JavaScript.
            result[String(position)] = String(characters[position - 1])
        }

        return ["chars": result]
    }
}

private enum Keychain {

    /// Identifies the single item this extension owns. `synchronizable: false`
    /// keeps the password on this Mac instead of pushing it to iCloud.
    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount,
            kSecAttrSynchronizable as String: false,
        ]
    }

    static func save(_ password: String) throws {
        try delete()

        var query = baseQuery
        query[kSecValueData as String] = Data(password.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlocked

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw HandlerError.keychain(status) }
    }

    static func load() throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw HandlerError.keychain(status)
        }
        return String(data: data, encoding: .utf8)
    }

    static func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw HandlerError.keychain(status)
        }
    }
}

private enum HandlerError: Error, CustomStringConvertible {
    case noPassword
    case positionOutOfRange(Int, Int)
    case keychain(OSStatus)

    var description: String {
        switch self {
        case .noPassword:
            return "No password stored yet."
        case let .positionOutOfRange(position, length):
            return "Position \(position) is beyond the stored password (\(length) characters)."
        case let .keychain(status):
            let detail = SecCopyErrorMessageString(status, nil) as String?
            return "Keychain error: \(detail ?? "OSStatus \(status)")"
        }
    }
}
