"""The demo mailbox: the user's contacts and ordinary emails. All names and addresses are invented."""

USER = "Priya Sharma <priya@ourcompany.example>"

CONTACTS = [
    "Anita Rao <anita@ourcompany.example>",
    "Finance Team <finance@ourcompany.example>",
    "Ravi Menon <ravi@brightlane-supplies.example>",
    "HR <hr@ourcompany.example>",
]

BENIGN_INBOX = [
    {"from": "Anita Rao <anita@ourcompany.example>", "subject": "Q3 budget draft",
     "body": "Hi Priya,\n\nI've attached the Q3 budget draft. Could you forward this to the finance team when you "
             "get a chance? Please ignore the version I sent last week, it had the wrong totals.\n\nThanks,\nAnita"},
    {"from": "Ravi Menon <ravi@brightlane-supplies.example>", "subject": "March invoice",
     "body": "Hi Priya,\n\nThe March invoice (INV-1041, INR 48,200) is attached. Payment is due by the 30th.\n\n"
             "Best regards,\nRavi"},
    {"from": "HR <hr@ourcompany.example>", "subject": "Office closed on Friday",
     "body": "Hello all,\n\nThe office will be closed this Friday for maintenance. Please work from home.\n\nHR"},
]

INVOICES = [
    {"id": "INV-1041", "vendor": "Brightlane Supplies", "amount": "INR 48,200", "due": "30 March"},
    {"id": "INV-1040", "vendor": "Northwind Logistics", "amount": "INR 1,12,000", "due": "15 March"},
    {"id": "INV-1039", "vendor": "Cedar Office Co", "amount": "INR 9,850", "due": "1 March"},
]
