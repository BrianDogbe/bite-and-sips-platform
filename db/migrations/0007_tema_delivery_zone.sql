-- Delivery covers anywhere in Tema. Only placeholder (demo) zones are changed; zones the owner has saved are left alone.
-- Centre is approximate (Tema city), radius 7 km. Check it against a map and adjust in Admin → Settings → Delivery zones.
UPDATE delivery_zones
   SET name = 'Tema (anywhere in Tema)',
       description = 'Delivery anywhere in Tema',
       center_lat = 5.6698,
       center_lng = -0.0166,
       radius_m = 7000,
       min_order_pesewas = 0,
       eta_min_minutes = 25,
       eta_max_minutes = 45,
       is_active = TRUE,
       sort_order = 1
 WHERE is_demo AND name LIKE 'Zone A%';
UPDATE delivery_zones SET is_active = FALSE WHERE is_demo AND name LIKE 'Zone B%';
