INSERT INTO user_role_scopes(user_id,role_code,organization_id,department_id,scope_type)
SELECT id,role,organization_id,
  CASE WHEN role='USER' THEN department_id ELSE NULL END,
  CASE WHEN role='ADMIN' THEN 'ALL' WHEN role='MANAGER' THEN 'ORGANIZATION' ELSE 'DEPARTMENT' END
FROM users
WHERE organization_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_role_scopes s WHERE s.user_id=users.id AND s.role_code=users.role);

CREATE INDEX IF NOT EXISTS idx_departments_parent_active
  ON departments(parent_id) WHERE status='ACTIVE';
