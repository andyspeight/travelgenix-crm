-- A place to put the street address.
--
-- The schema has always held city, postcode and country, but nowhere for the
-- first line of an address — so a household could be "in Leeds, LS1 4DY" and
-- still have no door to send documents to. The postcode was worse than
-- missing: the API accepted and stored it, but no screen ever offered a box
-- to type it in, so it could only arrive by import.
--
-- These three columns complete the address, and the create/edit forms gain a
-- postcode-lookup that fills them in. Everything is nullable: an address is
-- useful, not mandatory, and no existing household should suddenly read as
-- incomplete.

alter table households add column if not exists address_line1 text;
alter table households add column if not exists address_line2 text;
alter table households add column if not exists county text;
