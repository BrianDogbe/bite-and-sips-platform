-- The "support" (support / cashier) role no longer exists. Support cases and cash handling are done by the owner and managers.
DELETE FROM user_roles WHERE role = 'support';
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('owner','manager','kitchen','rider','customer'));
