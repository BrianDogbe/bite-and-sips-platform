# Roles and permissions

Defined in `src/server/auth/permissions.ts`; enforced in every server service (`requirePerm`). A person can hold several roles.

| Permission | Owner | Manager | Kitchen | Rider |
|---|---|---|---|---|
| dashboard.view | ✓ | ✓ | | |
| orders.view / orders.manage | ✓ | ✓ | | |
| orders.cancel | ✓ | ✓ | | |
| payments.view / payments.reconcile | ✓ | ✓ | | |
| payments.refund | ✓ | | | |
| cash.collect | ✓ | ✓ | | assigned order only |
| menu.manage | ✓ | ✓ | | |
| menu.availability (sold out) | ✓ | ✓ | ✓ | |
| kitchen.operate | ✓ | ✓ | ✓ | |
| kitchen.monitor | ✓ | ✓ | | |
| dispatch.manage | ✓ | ✓ | | |
| dispatch.assign (pick an online rider from the kitchen screen) | ✓ | ✓ | ✓ | |
| rider.deliver | | | | ✓ |
| customers.view / customers.manage | ✓ | ✓ | | |
| inventory.manage | ✓ | ✓ | | |
| finance.view / reports.view | ✓ | ✓ | | |
| settings.manage (hours, zones, ordering limits) | ✓ | ✓ | | |
| settings.money (payment options, service charge, tax, minimum order) | ✓ | | | |
| finance.manage (record expenses) | ✓ | | | |
| staff.manage | ✓ | ✓ (can't grant/revoke owner) | | |
| support.manage | ✓ | ✓ | | |
| audit.view | ✓ | | | |

Data minimisation:
- Kitchen screens receive no phone numbers or money amounts.
- Riders don't see the address or phone number until they accept, and only for their own assignments.
- Staff without `customers.view` see masked phone numbers, and only the owner and managers see payment records.
- Customers reach orders only through the secret tracking link, through order number + phone lookup (rate limited), or through their own account.

Portals: `/admin` accepts the owner and managers. `/kitchen` accepts owner, manager and kitchen. `/rider` accepts riders and the owner.
