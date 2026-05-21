ALTER TABLE public.projects
  ADD CONSTRAINT projects_manager_employee_id_fkey
  FOREIGN KEY (manager_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;