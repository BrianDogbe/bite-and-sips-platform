-- The "dispatcher" role no longer exists. Deliveries are assigned by the kitchen, the owner and managers.
DELETE FROM user_roles WHERE role = 'dispatcher';
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('owner','manager','kitchen','rider','support','customer'));
