INSERT INTO public.topics (id, name, category) VALUES
 ('gaming','Gaming','gaming'),('speedrunning','Speedrunning','gaming'),('streaming','Streaming','gaming'),('indiedev','Indie Dev','technology'),
 ('tech','Technology','technology'),('startups','Startups','technology'),('ai','AI','technology'),('programming','Programming','technology'),
 ('music','Music','entertainment'),('film','Film & TV','entertainment'),('celebs','Pop Culture','entertainment'),('comedy','Comedy','humor'),
 ('memes','Memes','humor'),('sports','Sports','sports'),('politics','Public Affairs','public_affairs'),('science','Science','technology'),
 ('art','Art & Design','culture'),('books','Books','culture'),('food','Food','everyday'),('fitness','Fitness','everyday'),
 ('everyday','Everyday Life','everyday'),('creator','Creator Economy','creator_drama'),('internet','Internet Culture','culture'),('finance','Money','technology')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category;

INSERT INTO public.achievements (code, name, description, category, requirements, sort_order) VALUES
 ('first_post','First Post','Publish your first post.','starter','{"posts":1}',1),
 ('first_follower','First Follower','Someone chose to follow you.','audience','{"new_followers":1}',2),
 ('followers_100','First 100 Followers','Reach 100 followers.','audience','{"followers":100}',3),
 ('first_viral','First Viral Post','A post of yours spread far beyond your audience.','reach','{"viral_posts":1}',4),
 ('creator_mention','First Major Creator Mention','A notable account mentioned or quoted you.','recognition','{"notable_mention":1}',5),
 ('first_collab','First Collaboration','Complete a collaboration with another creator.','relationships','{"collabs":1}',6),
 ('first_feud','First Public Feud','Become part of a public feud.','drama','{"feuds":1}',7),
 ('first_trend','First Trend','Start a trend that others picked up.','culture','{"trends_started":1}',8),
 ('community_milestone','First Community Milestone','Earn standing inside a community.','community','{"community_standing":10}',9),
 ('reputation_recovery','Reputation Recovery','Recover 10 credibility after a drop.','reputation','{"credibility_recovered":10}',10),
 ('credibility_75','Credibility Milestone','Reach 75 credibility.','reputation','{"credibility":75}',11),
 ('niche_authority','Niche Authority','Become a recognized voice in one topic.','reputation','{"niche_authority":40}',12),
 ('accidental_celebrity','Accidental Celebrity','Go viral with a post you never expected to land.','reach','{"viral_low_effort":1}',13),
 ('most_divisive','Most Divisive Post','Split the room: lots of love and lots of hate on one post.','drama','{"divisive_post":1}',14),
 ('comeback_story','Comeback Story','Climb back after a public controversy.','reputation','{"comeback":1}',15),
 ('internet_legend','Internet Legend','Reach the Legend rank.','rank','{"rank":"Legend"}',16)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, category = EXCLUDED.category, requirements = EXCLUDED.requirements, sort_order = EXCLUDED.sort_order;
