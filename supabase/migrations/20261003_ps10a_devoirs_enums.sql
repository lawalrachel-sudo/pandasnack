-- PS-10a — Panda Devoirs (1/2) : nouvelles valeurs d'enum (dans leur propre migration, car
-- une valeur d'enum ajoutée ne peut pas être utilisée dans la même transaction).
alter type public.source_group add value if not exists 'panda_devoirs';
alter type public.day_type add value if not exists 'devoirs';
