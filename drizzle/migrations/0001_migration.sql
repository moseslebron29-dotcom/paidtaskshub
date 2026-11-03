
CREATE POLICY "proofs own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "proofs own or admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'task-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));
