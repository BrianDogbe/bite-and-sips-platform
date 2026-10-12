# Roles and permissions

Defined in `src/server/auth/permissions.ts`; enforced in every server service (`requirePerm`). A person can hold several roles.

| Permission | Owner | Manager | Kitchen | Dispatcher | Rider | Support/cashier |
|---|---|---|---|---|---|---|
| dashboard.view | ✓ | ✓ | | ✓ | | ✓ |
| orders.view / orders.manage | ✓ | ✓ | | view | | ✓ |
| orders.cancel | ✓ | ✓ | | | | |
| payments.view / payments.refund / payments.reconcile | ✓ | ✓ | | | | |
| cash.collect | ✓ | ✓ | | | assigned order only | ✓ |
| menu.manage | ✓ | ✓ | | | | |
| menu.availability (sold out) | ✓ | ✓ | ✓ | | | |
| kitchen.operate | ✓ | ✓ | ✓ | | | |
| kitchen.monitor | ✓ | ✓ | | ✓ | | ✓ |
| dispatch.manage | ✓ | ✓ | | ✓ | | |
| rider.deliver | | | | | ✓ | |
| customers.view / customers.manage | ✓ | ✓ | | | | view |
| inventory.manage | ✓ | ✓ | | | | |
| finance.view / reports.view | ✓ | ✓ | | | | |
| settings.manage | ✓ | ✓ | | | | |
| staff.manage | ✓ | ✓ (can't grant/revoke owner) | | | | |
| support.manage | ✓ | ✓ | | | | ✓ |
| audit.view | ✓ | ✓ | | | | |

Data minimisation:
- Kitchen screens receive no phone numbers or money amounts.
- Riders don't see the address or phone number until they accept, and only for their own assignments.
- Staff without `customers.view` see masked phone numbers, and dispatchers can't see payment records.
- Customers reach orders only through the secret tracking link, through order number + phone lookup (rate limited), or through their own account.

Portals: `/admin` accepts owner, manager, dispatcher and support. `/kitchen` accepts owner, manager and kitchen. `/rider` accepts riders.
