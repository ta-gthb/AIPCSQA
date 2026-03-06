"""
flipkart_policies.py
Chunked Flipkart customer support policy knowledge base for RAG retrieval.
Each chunk is a self-contained policy segment with metadata.
"""

POLICY_CHUNKS = [

    # ─── RETURNS ──────────────────────────────────────────────────────────────
    {
        "id": "returns_001",
        "category": "Returns",
        "topic": "Return eligibility window",
        "content": (
            "Flipkart offers a 10-day return window for most product categories "
            "from the date of delivery. Customers can raise a return request within "
            "this window if the product is defective, damaged, or not as described. "
            "After 10 days, return requests are generally not accepted unless the "
            "product comes with a seller-specific extended return policy. Electronics "
            "and mobile phones have a 7-day return window. Furniture and large appliances "
            "have a 30-day installation-based return window."
        ),
    },
    {
        "id": "returns_002",
        "category": "Returns",
        "topic": "Non-returnable items",
        "content": (
            "The following items are NOT eligible for return on Flipkart: "
            "perishable goods, personal hygiene products (once opened), inner wear and "
            "socks (once delivered), customised/personalised products, downloadable "
            "software, items marked 'Non-Returnable' on the product listing, and "
            "products with tampered or missing serial numbers. Gift cards and vouchers "
            "are also non-returnable. Beauty products that have been opened or used "
            "are non-returnable unless they arrived damaged."
        ),
    },
    {
        "id": "returns_003",
        "category": "Returns",
        "topic": "Condition required for return",
        "content": (
            "For a return to be accepted, the product must be unused and in its "
            "original condition with all original tags and packaging intact. The product "
            "should be returned with all accessories, freebies, and documentation "
            "that came with it. Products showing signs of use, physical damage caused "
            "by the customer, or missing parts may be rejected during quality check. "
            "A return will be denied if the product does not match the item originally "
            "delivered, as verified by the return pick-up agent."
        ),
    },
    {
        "id": "returns_004",
        "category": "Returns",
        "topic": "How to raise a return request",
        "content": (
            "To raise a return request: go to My Orders → select the item → click "
            "'Return' → select the reason (defective, wrong item, not as described, etc.) "
            "→ choose refund or replacement → schedule a pick-up. A return pick-up will "
            "be scheduled within 3–5 business days. Once the item is picked up and "
            "quality-checked at the warehouse (3–7 business days), a refund or replacement "
            "is initiated. Support agents can also raise return requests on behalf of the "
            "customer after verifying order details."
        ),
    },
    {
        "id": "returns_005",
        "category": "Returns",
        "topic": "Damaged or defective product on arrival",
        "content": (
            "If a customer receives a damaged, defective, or incorrect product, they "
            "should report it within 48 hours of delivery for fastest resolution. "
            "Customers must upload photos or video of the damage when raising the request. "
            "For electronics showing manufacturing defects, the customer may be directed "
            "to the brand's authorised service centre if the return window has passed. "
            "Flipkart guarantees either a full refund or replacement for verified "
            "damage-on-arrival cases."
        ),
    },

    # ─── REFUNDS ──────────────────────────────────────────────────────────────
    {
        "id": "refunds_001",
        "category": "Refunds",
        "topic": "Refund timeline after return",
        "content": (
            "Refund timelines after a successful return quality check: "
            "Flipkart Wallet — 24 hours; UPI — 1–2 business days; "
            "Debit/Credit Card — 7–10 business days; Net Banking — 3–5 business days; "
            "EMI — 7–10 business days (EMI cancellation also raised with bank); "
            "Cash on Delivery — 7–10 business days to bank account. "
            "The refund clock starts only after warehouse quality-check approval, "
            "not from the pick-up date."
        ),
    },
    {
        "id": "refunds_002",
        "category": "Refunds",
        "topic": "Refund to original payment method",
        "content": (
            "Refunds are always credited back to the original payment source. "
            "If paid by credit/debit card, the refund goes to the same card. "
            "If the card has expired or been replaced, the bank will credit the "
            "linked account automatically. Customers cannot request a refund to a "
            "different payment method than the one used for purchase. "
            "If the original method is unavailable, an exception process can be raised "
            "which takes 15–20 business days and requires manual verification."
        ),
    },
    {
        "id": "refunds_003",
        "category": "Refunds",
        "topic": "Refund for cancelled orders",
        "content": (
            "For orders cancelled before shipment, refunds are processed within "
            "5–7 business days. For prepaid orders cancelled after dispatch but before "
            "delivery, the refund is initiated once the courier returns the shipment to "
            "the warehouse (can take 7–14 days). "
            "Instant refund to Flipkart Wallet is available in select cases for "
            "Flipkart Plus members. Delivery charges (if any) are also refunded "
            "when the cancellation is due to seller or logistical failure."
        ),
    },
    {
        "id": "refunds_004",
        "category": "Refunds",
        "topic": "Partial refunds and deductions",
        "content": (
            "Partial refunds may be issued when: only part of the order is returned; "
            "the product fails quality check partially (e.g., missing accessories); "
            "or when a combo offer was partially used. The refund amount will reflect "
            "the discount applied proportionally. Flipkart does not deduct restocking fees. "
            "Shipping charges are non-refundable if the return reason is 'change of mind' "
            "and not a seller/product fault."
        ),
    },

    # ─── CANCELLATIONS ────────────────────────────────────────────────────────
    {
        "id": "cancel_001",
        "category": "Cancellations",
        "topic": "Cancel before shipment",
        "content": (
            "Orders can be cancelled at no charge before the seller ships them. "
            "Go to My Orders → select the order → click 'Cancel'. "
            "For prepaid orders, the refund is processed within 5–7 business days. "
            "Orders in 'Packing' status may also be cancelled, but "
            "once marked 'Shipped' or handed to courier, cancellation is not possible "
            "through self-service and the customer must refuse delivery or raise a return."
        ),
    },
    {
        "id": "cancel_002",
        "category": "Cancellations",
        "topic": "Cancel after shipment or during transit",
        "content": (
            "Once an order is shipped, it cannot be cancelled via the app. "
            "The customer should refuse delivery when the courier arrives — "
            "the courier will return it to the seller and a refund will be triggered "
            "after the item is received back (7–14 days). "
            "Alternatively, customers can accept delivery and then raise a return request "
            "within the return window. Support agents should not promise immediate "
            "cancellation for already-shipped orders."
        ),
    },
    {
        "id": "cancel_003",
        "category": "Cancellations",
        "topic": "Seller-cancelled orders",
        "content": (
            "If a seller cancels the order due to stock unavailability or other reasons, "
            "the customer receives an automatic full refund within 7 business days. "
            "Flipkart also awards compensation in the form of Flipkart SuperCoins "
            "for seller-cancelled prepaid orders as an apology. "
            "The customer should be informed proactively via SMS/email when a seller "
            "cancels, and a replacement order can be suggested from another seller."
        ),
    },

    # ─── DELIVERY & SHIPPING ──────────────────────────────────────────────────
    {
        "id": "delivery_001",
        "category": "Delivery & Shipping",
        "topic": "Standard delivery timelines",
        "content": (
            "Standard delivery in metro cities (Mumbai, Delhi, Bangalore, Chennai, "
            "Hyderabad, Kolkata): 2–4 business days. "
            "Tier-2 cities: 3–6 business days. "
            "Remote or rural pin codes: 5–10 business days. "
            "Flipkart Express delivery (same-day or next-day) is available in select "
            "cities for eligible products. Business days exclude Sundays and public "
            "holidays. Delays caused by natural disasters or strikes are considered "
            "force majeure and no penalty applies to the seller."
        ),
    },
    {
        "id": "delivery_002",
        "category": "Delivery & Shipping",
        "topic": "Missing or stolen package after delivery",
        "content": (
            "If the tracking shows 'Delivered' but the customer has not received the "
            "parcel, the customer must report it within 72 hours of the marked delivery. "
            "Flipkart will initiate a courier investigation (NDR — Non-Delivery Report). "
            "Investigation takes 3–5 business days. "
            "If confirmed undelivered, a replacement or full refund is issued. "
            "If delivery proof (photo/OTP) shows successful delivery, the matter may "
            "be escalated to law enforcement and Flipkart's fraud team."
        ),
    },
    {
        "id": "delivery_003",
        "category": "Delivery & Shipping",
        "topic": "Delivery to wrong address",
        "content": (
            "If the customer provided the wrong delivery address, Flipkart cannot "
            "guarantee address change once the order is shipped. "
            "Customers must contact support immediately if a wrong address is noticed "
            "before dispatch — address can be updated in My Orders. "
            "After dispatch, the courier may allow address change for a fee in select cases. "
            "If the product is delivered to a wrong address due to courier error, "
            "a full refund or free re-delivery is arranged within 5–7 business days."
        ),
    },
    {
        "id": "delivery_004",
        "category": "Delivery & Shipping",
        "topic": "Delayed delivery",
        "content": (
            "If delivery exceeds the estimated delivery date by more than 3 days, "
            "the customer is entitled to: "
            "1) A status investigation by Flipkart logistics; "
            "2) Option to cancel and receive a full refund if order is prepaid; "
            "3) Flipkart Plus members may receive compensation in SuperCoins. "
            "Agents must not promise a specific delivery date they cannot guarantee. "
            "The correct phrase is: 'Based on current tracking, your order should arrive by [X], "
            "but I will escalate if it does not.'"
        ),
    },
    {
        "id": "delivery_005",
        "category": "Delivery & Shipping",
        "topic": "Open delivery or package tampering",
        "content": (
            "Customers should inspect the package at the time of delivery. "
            "If the packaging appears tampered, torn, or opened, the customer has the "
            "right to refuse delivery — this will NOT be counted as a return and "
            "a full refund will be issued within 5–7 business days. "
            "If the customer accepts a tampered package and then reports damage, "
            "it is still eligible for a return under the 'damaged on arrival' policy, "
            "provided it is reported within 48 hours with photographic evidence."
        ),
    },

    # ─── PAYMENTS & BILLING ───────────────────────────────────────────────────
    {
        "id": "payment_001",
        "category": "Payments & Billing",
        "topic": "Accepted payment methods",
        "content": (
            "Flipkart accepts: UPI (PhonePe, Google Pay, BHIM), Debit Cards (Visa, "
            "Mastercard, RuPay), Credit Cards (Visa, Mastercard, Amex, Diners), "
            "Net Banking (50+ banks), Flipkart Pay Later (BNPL — Buy Now Pay Later), "
            "EMI (6/9/12/18/24 months, zero-cost EMI on select cards), "
            "Flipkart Wallet / Gift Cards, and Cash on Delivery (COD, available "
            "for orders below ₹50,000 in eligible pin codes)."
        ),
    },
    {
        "id": "payment_002",
        "category": "Payments & Billing",
        "topic": "Unauthorized or duplicate charge",
        "content": (
            "If a customer reports an unauthorized charge or double debit, the agent "
            "must: 1) Verify the transaction in the order history; "
            "2) Check if there is a corresponding order placed — duplicate debits without "
            "a matching order are bank holds that reverse within 5–7 business days. "
            "3) For confirmed unauthorized charges, raise a payment dispute ticket "
            "immediately. Flipkart does not charge customers without a confirmed order. "
            "Customers should also contact their bank for a chargeback if unauthorized "
            "use of card is suspected."
        ),
    },
    {
        "id": "payment_003",
        "category": "Payments & Billing",
        "topic": "EMI cancellation and refund",
        "content": (
            "When an EMI order is returned or cancelled, Flipkart initiates both the "
            "refund and the EMI cancellation request with the bank simultaneously. "
            "The bank cancels the remaining EMI installments and refunds any already-paid "
            "EMI amounts (minus processing fee if applicable) within 7–10 business days. "
            "Zero-cost EMI cashbacks are reversed proportionally. "
            "Customers may see one additional EMI deduction if the cancellation is raised "
            "close to the billing date — this is refunded by the bank."
        ),
    },
    {
        "id": "payment_004",
        "category": "Payments & Billing",
        "topic": "Flipkart Pay Later billing",
        "content": (
            "Flipkart Pay Later allows purchase now and payment by the 1st of the following "
            "month. Credit limit up to ₹70,000 depending on eligibility. "
            "A late payment fee of ₹150–₹500 is charged if the due date is missed. "
            "For returns on Pay Later orders, the amount is credited back to the "
            "Pay Later balance within 2–3 business days, reducing the outstanding balance. "
            "Customers can check their Pay Later statement in the app under 'Payments'."
        ),
    },

    # ─── REPLACEMENTS ─────────────────────────────────────────────────────────
    {
        "id": "replacement_001",
        "category": "Replacements",
        "topic": "Replacement eligibility",
        "content": (
            "Replacement is offered when the product received is defective, damaged, "
            "or not as described AND a replacement unit is available with the seller. "
            "Replacement is subject to the same return window (7 days for electronics, "
            "10 days for most other categories). "
            "If the exact same product is unavailable, the customer can choose a refund. "
            "A replacement does not restart the return window — the original purchase "
            "date governs warranty and any future returns."
        ),
    },
    {
        "id": "replacement_002",
        "category": "Replacements",
        "topic": "Replacement vs Refund choice",
        "content": (
            "For eligible cases, customers can choose between replacement and refund. "
            "Agents must present both options clearly without pushing one over the other. "
            "If the customer initially chooses replacement but the seller marks it "
            "unavailable within 48 hours, the customer is automatically offered a full "
            "refund. Customers can switch from replacement to refund at any time before "
            "the replacement item is shipped by contacting support."
        ),
    },

    # ─── CUSTOMER ACCOUNT ─────────────────────────────────────────────────────
    {
        "id": "account_001",
        "category": "Account & Security",
        "topic": "Account locked or suspended",
        "content": (
            "Flipkart accounts may be locked due to: multiple failed login attempts "
            "(locked for 30 minutes automatically), suspicious activity detected by "
            "the fraud team, or violation of Flipkart's Terms of Use. "
            "For auto-locked accounts, waiting 30 minutes and using 'Forgot Password' "
            "resolves the issue. For security-suspended accounts, the customer must "
            "complete identity verification (submit Aadhaar or PAN) via the in-app process. "
            "Agents must not manually unlock accounts — they should guide customers to "
            "the self-service flow or raise a ticket for the Trust & Safety team."
        ),
    },
    {
        "id": "account_002",
        "category": "Account & Security",
        "topic": "Password reset and OTP",
        "content": (
            "Password reset OTPs are sent to the registered mobile number or email. "
            "OTPs expire in 10 minutes. If OTP is not received: "
            "1) Check spam/junk folder; 2) Ensure mobile number is not on DND; "
            "3) Try the alternate method (email vs SMS); "
            "4) Wait 5 minutes for network delays before resending. "
            "Agents cannot see or reset passwords manually. They can trigger a "
            "password reset link from the admin console if self-service is failing. "
            "For number change requests, the customer must raise a ticket with ID proof."
        ),
    },
    {
        "id": "account_003",
        "category": "Account & Security",
        "topic": "Unauthorized account access / hacked account",
        "content": (
            "If a customer suspects unauthorized account access: "
            "1) Immediately change the password; 2) Remove unknown addresses from the address book; "
            "3) Report to Flipkart via support — the security team will audit login activity. "
            "Agents must escalate to the Fraud & Trust team for any suspected account compromise. "
            "Orders placed without the customer's knowledge are covered — Flipkart will "
            "cancel them if unshipped or initiate a dispute for delivered fraudulent orders. "
            "Customers should also file a cyber crime report with local police."
        ),
    },

    # ─── PRODUCT WARRANTY ─────────────────────────────────────────────────────
    {
        "id": "warranty_001",
        "category": "Warranty & Repair",
        "topic": "Brand warranty vs. Flipkart warranty",
        "content": (
            "Most products sold on Flipkart carry the brand's manufacturer warranty, "
            "NOT a Flipkart warranty. Warranty service is provided by the brand's "
            "authorised service centres, not by Flipkart. "
            "Flipkart's Assured products come with a 30-day replacement guarantee "
            "in addition to the brand warranty. "
            "Agents must clearly distinguish: Flipkart handles returns/replacements "
            "within the return window; the brand handles repairs under warranty after "
            "that window."
        ),
    },
    {
        "id": "warranty_002",
        "category": "Warranty & Repair",
        "topic": "Out-of-warranty repair",
        "content": (
            "For products outside the Flipkart return window but within brand warranty, "
            "the customer must contact the brand's authorised service centre directly. "
            "Flipkart support can provide service centre contact details for major brands "
            "(Samsung, Apple, OnePlus, LG, HP, Dell, etc.). "
            "For out-of-warranty products, Flipkart cannot facilitate repair or replacement. "
            "Customers may be directed to third-party repair options or the brand's "
            "out-of-warranty paid repair service."
        ),
    },

    # ─── ESCALATION POLICY ────────────────────────────────────────────────────
    {
        "id": "escalation_001",
        "category": "Escalation",
        "topic": "When to escalate a customer complaint",
        "content": (
            "Escalate to a senior agent or supervisor when: "
            "1) The customer has raised the same issue 3 or more times without resolution; "
            "2) The issue involves potential fraud, account compromise, or financial loss "
            "above ₹5,000; "
            "3) The customer is highly distressed and has asked to speak with a manager; "
            "4) The case involves a legal threat or consumer forum complaint; "
            "5) A refund or return has been pending beyond the committed SLA for 3+ days. "
            "Agents must NOT promise a specific outcome that only a supervisor can authorise."
        ),
    },
    {
        "id": "escalation_002",
        "category": "Escalation",
        "topic": "Escalation SLAs and follow-up",
        "content": (
            "Escalated complaints must be resolved within: "
            "Tier 1 (standard complaint): 48 hours; "
            "Tier 2 (senior agent): 72 hours; "
            "Tier 3 (supervisor/manager): 5 business days; "
            "Legal/Fraud cases: 10 business days. "
            "Escalated customers must receive a follow-up call or email within 24 hours "
            "of escalation confirming the case has been received and a timeline. "
            "Agents must document all actions taken before escalating in the case notes."
        ),
    },

    # ─── SUPERCOINS & REWARDS ─────────────────────────────────────────────────
    {
        "id": "rewards_001",
        "category": "SuperCoins & Flipkart Plus",
        "topic": "SuperCoins earning and redemption",
        "content": (
            "Flipkart Plus members earn SuperCoins on every purchase: "
            "1 SuperCoin per ₹100 spent for standard members; "
            "2 SuperCoins per ₹100 for Flipkart Plus members. "
            "SuperCoins can be redeemed for: discounts on next purchase, "
            "streaming subscriptions (Hotstar, Zee5), or charitable donations. "
            "SuperCoins expire 1 year from the date of earning. "
            "SuperCoins are NOT awarded on orders that are later returned or cancelled — "
            "if an order is returned, the SuperCoins earned on it are reversed."
        ),
    },
    {
        "id": "rewards_002",
        "category": "SuperCoins & Flipkart Plus",
        "topic": "Flipkart Plus membership",
        "content": (
            "Flipkart Plus is a loyalty program that costs ₹0 (free) — customers earn "
            "membership by accumulating 300 SuperCoins. Benefits include: "
            "free priority shipping, early access to sales, 2x SuperCoins earning, "
            "extended return windows in select categories, and exclusive offers. "
            "Plus membership is automatically renewed each year if the customer "
            "maintains 300+ SuperCoins. Cancelling Plus membership is not "
            "directly available — it lapses if SuperCoin balance drops below 300."
        ),
    },

    # ─── COMPLIANCE & CUSTOMER RIGHTS ─────────────────────────────────────────
    {
        "id": "compliance_001",
        "category": "Compliance & Legal",
        "topic": "Consumer Protection Act 2019 rights",
        "content": (
            "Under the Consumer Protection Act 2019 (India), customers have the right to: "
            "1) Receive goods and services as described; "
            "2) Protection against unfair trade practices; "
            "3) Seek redressal for defective goods or services; "
            "4) File complaints with the District Consumer Disputes Redressal Commission. "
            "Agents must acknowledge these rights when a customer mentions 'consumer forum' "
            "or 'legal action'. Attempting to discourage a customer from filing a complaint "
            "is a policy violation. Agents must provide Flipkart's Grievance Officer contact "
            "details if requested."
        ),
    },
    {
        "id": "compliance_002",
        "category": "Compliance & Legal",
        "topic": "Data privacy and DPDP Act",
        "content": (
            "Under India's Digital Personal Data Protection Act (DPDP) 2023, "
            "Flipkart cannot share customer's personal data (name, address, payment info, "
            "order details) with any third party without consent. "
            "Agents must verify caller identity using OTP verification before accessing "
            "account details. Agents must NOT read out full card numbers, bank account "
            "numbers, or Aadhaar numbers over call. "
            "Customers have the right to request data deletion — such requests must be "
            "escalated to the Data Privacy team within 7 days of the request."
        ),
    },
    {
        "id": "compliance_003",
        "category": "Compliance & Legal",
        "topic": "Mandatory disclosures agents must give",
        "content": (
            "Customer support agents are REQUIRED to disclose the following when relevant: "
            "1) Exact refund timeline before confirming a refund; "
            "2) That warranty service is provided by the brand, not Flipkart; "
            "3) That seller-specific policies may differ from Flipkart's default policy; "
            "4) The case/ticket reference number at the end of every interaction; "
            "5) Escalation options if the issue cannot be resolved in the current interaction. "
            "Failure to provide these disclosures is a compliance violation logged in quality audits."
        ),
    },

    # ─── COD POLICY ───────────────────────────────────────────────────────────
    {
        "id": "cod_001",
        "category": "Cash on Delivery",
        "topic": "COD availability and limits",
        "content": (
            "Cash on Delivery (COD) is available for orders up to ₹50,000 in eligible pin codes. "
            "COD is not available for: digital goods, Flipkart Pay Later purchases, orders "
            "from certain categories like large appliances. "
            "COD orders that are refused at delivery (customer refuses to accept) are marked "
            "as 'Return to Origin' and Flipkart may restrict future COD orders for that address "
            "if refusal patterns are detected. "
            "For genuine refusals (damaged packaging), no COD restriction applies."
        ),
    },
]

# ── Helper to get all chunks for injection when no retrieval is needed ───────
def get_all_policy_text(max_chars: int = 4000) -> str:
    """Return a concise policy summary for injection into prompts."""
    lines = []
    current_category = None
    chars = 0
    for chunk in POLICY_CHUNKS:
        if chars >= max_chars:
            break
        if chunk["category"] != current_category:
            current_category = chunk["category"]
            lines.append(f"\n## {current_category}")
        line = f"- [{chunk['topic']}]: {chunk['content'][:200]}..."
        lines.append(line)
        chars += len(line)
    return "\n".join(lines)
