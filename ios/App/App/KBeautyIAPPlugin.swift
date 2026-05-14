import Capacitor
import Foundation
import StoreKit

@objc(KBeautyIAPPlugin)
class KBeautyIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "KBeautyIAPPlugin"
    let jsName = "KBeautyIAP"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise)
    ]

    private let premiumProductIds: Set<String> = [
        "kbeautyai_premium_monthly",
        "kbeautyai_premium_yearly"
    ]

    enum VerificationFailure: Error {
        case unverified
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            do {
                let products = try await Product.products(for: Array(premiumProductIds))
                    .sorted { left, right in
                        productRank(left.id) < productRank(right.id)
                    }

                call.resolve([
                    "products": products.map(productPayload)
                ])
            } catch {
                call.reject("Unable to load App Store products.", "PRODUCTS_UNAVAILABLE", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), premiumProductIds.contains(productId) else {
            call.reject("Unsupported App Store product.", "INVALID_PRODUCT")
            return
        }

        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("The App Store product is not available.", "PRODUCT_UNAVAILABLE")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    let transaction = try checkVerified(verification)
                    guard isActivePremiumTransaction(transaction) else {
                        call.reject("The App Store transaction is not active.", "TRANSACTION_INACTIVE")
                        return
                    }

                    await transaction.finish()
                    call.resolve(transactionPayload(transaction, signedTransactionJws: verification.jwsRepresentation))
                case .userCancelled:
                    call.resolve(["cancelled": true])
                case .pending:
                    call.resolve(["pending": true])
                @unknown default:
                    call.reject("The App Store purchase could not be completed.", "PURCHASE_UNKNOWN")
                }
            } catch {
                call.reject("The App Store purchase failed.", "PURCHASE_FAILED", error)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                call.resolve(await entitlementPayload())
            } catch {
                call.reject("Unable to restore App Store purchases.", "RESTORE_FAILED", error)
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            call.resolve(await entitlementPayload())
        }
    }

    private func entitlementPayload() async -> [String: Any] {
        var transactions: [[String: Any]] = []

        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result), isActivePremiumTransaction(transaction) else {
                continue
            }

            transactions.append(transactionPayload(transaction, signedTransactionJws: result.jwsRepresentation))
        }

        return [
            "hasActivePremium": !transactions.isEmpty,
            "transactions": transactions
        ]
    }

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            throw VerificationFailure.unverified
        case .verified(let safe):
            return safe
        }
    }

    private func isActivePremiumTransaction(_ transaction: Transaction) -> Bool {
        if !premiumProductIds.contains(transaction.productID) {
            return false
        }

        if transaction.revocationDate != nil {
            return false
        }

        if let expirationDate = transaction.expirationDate, expirationDate <= Date() {
            return false
        }

        return true
    }

    private func productRank(_ productId: String) -> Int {
        switch productId {
        case "kbeautyai_premium_monthly":
            return 0
        case "kbeautyai_premium_yearly":
            return 1
        default:
            return 99
        }
    }

    private func productPayload(_ product: Product) -> [String: Any] {
        return [
            "currencyCode": product.priceFormatStyle.currencyCode,
            "description": product.description,
            "displayPrice": product.displayPrice,
            "id": product.id,
            "price": NSDecimalNumber(decimal: product.price).doubleValue,
            "title": product.displayName
        ]
    }

    private func transactionPayload(_ transaction: Transaction, signedTransactionJws: String) -> [String: Any] {
        var payload: [String: Any] = [
            "originalTransactionId": String(transaction.originalID),
            "productId": transaction.productID,
            "purchaseDate": isoString(transaction.purchaseDate),
            "signedTransactionJws": signedTransactionJws,
            "transactionId": String(transaction.id)
        ]

        if #available(iOS 16.0, *) {
            payload["environment"] = String(describing: transaction.environment)
        }

        if let appAccountToken = transaction.appAccountToken {
            payload["appAccountToken"] = appAccountToken.uuidString
        }

        if let expirationDate = transaction.expirationDate {
            payload["expiresDate"] = isoString(expirationDate)
        }

        return payload
    }

    private func isoString(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
