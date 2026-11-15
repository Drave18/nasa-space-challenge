import { CATALOG, loadMission, type LoadedMission } from './catalog.ts';

export interface LessonMilestone { date: string; title: string; explanation: string; source: string }
export interface QuizQuestion { prompt: string; choices: [string, string, string]; correct: number; feedback: string; source: string }
export interface MissionLesson {
  slug: string;
  headings: { idea: string; craft: string; learned: string };
  idea: string;
  craft: string[];
  learned: string[];
  milestones: LessonMilestone[];
  sources: { idea: string; craft: string; learned: string };
  quiz: QuizQuestion[];
}

type LessonSources = MissionLesson['sources'];
// The captured mission page is the default reference. These official NASA
// pages supply details absent from the captures; the footer exposes every URL.
const sourceOverrides: Record<string, Partial<LessonSources>> = {
  'mars-exploration-rovers': {
    craft: 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/science-instruments/',
    learned: 'https://science.nasa.gov/mission/mars-exploration-rovers-spirit-and-opportunity/science-highlights/',
  },
  insight: {
    craft: 'https://science.nasa.gov/mission/insight/spacecraft/',
    learned: 'https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/',
  },
  ingenuity: {
    idea: 'https://www.jpl.nasa.gov/missions/ingenuity/',
    craft: 'https://www.jpl.nasa.gov/news/press_kits/ingenuity/landing/quick_facts/',
  },
  dawn: {
    idea: 'https://science.nasa.gov/mission/dawn/objectives/',
    craft: 'https://science.nasa.gov/mission/dawn/technology/spacecraft/',
    learned: 'https://www.nasa.gov/news-release/nasas-dawn-mission-to-asteroid-belt-comes-to-end/',
  },
};
type LessonCopy = Pick<MissionLesson, 'idea' | 'craft' | 'learned'>;

// Original explanations based on the captured mission records and the NASA
// references below. Paragraph boundaries keep the longer lessons easy to read.
const narratives: Record<string, LessonCopy> = {
  'apollo-11': {
    idea: 'Apollo 11 had to solve two connected problems: land people on another world and bring them back to a spacecraft waiting in orbit. Eagle carried Neil Armstrong and Buzz Aldrin to the Sea of Tranquility while Michael Collins remained above. The visit also had a scientific purpose. With limited time outside, the astronauts needed to collect samples, photograph their surroundings, and deploy instruments. Every task depended on a lander that could serve as both a temporary home and a reliable return vehicle.',
    craft: [
      'Eagle divided the journey between two stages. The lower descent stage carried the landing engine, fuel, equipment, and four widely spaced legs. Its engine could vary its thrust to control the approach. Once on the ground, this section supported the cabin and gave the astronauts a platform and ladder for reaching the surface.',
      'The upper ascent stage contained the pressurized cabin, navigation equipment, and a separate engine for departure. Leaving the landing gear and empty lower stage behind reduced the load that had to rise into orbit. Small steering thrusters helped the cabin approach and dock with the command module, where the crew reunited for the journey home.',
    ],
    learned: [
      'The astronauts left a seismometer, an instrument that measures ground vibrations, to investigate activity beneath the surface. A dust detector monitored conditions affecting solar cells. These instruments extended the visit beyond the time the crew could stay, although the powered experiment package stopped accepting commands during its second lunar day.',
      'A separate laser reflector needed no electrical supply: it returned light toward telescopes on Earth so researchers could measure the distance to the Moon. These different lifetimes matter when looking at the equipment left behind. The descent stage marks the landing, while the scientific hardware shows how a brief human visit could support observations after departure.',
    ],
  },
  'apollo-12': {
    idea: 'After Apollo 11 proved that people could land on the Moon, Apollo 12 tested whether they could reach a carefully chosen destination. Pete Conrad and Alan Bean aimed Intrepid toward Surveyor 3, a robotic lander that had arrived in 1967. Landing within walking distance would make an unusual investigation possible: examining equipment exposed to the lunar environment for years. The mission combined precision navigation, geological fieldwork, and the deployment of instruments designed to keep studying the Moon after the astronauts returned home.',
    craft: [
      'Intrepid used the same two-stage approach as Eagle, with a lower section for landing and an upper cabin for returning to orbit. The descent stage also carried scientific equipment. Its storage spaces had to accommodate instruments that the astronauts could unload, carry across the surface, and set up while wearing bulky protective suits.',
      'The lower stage became the launchpad when the crew departed. The upper stage carried Conrad and Bean back to Richard Gordon in the command module. After that rendezvous, controllers deliberately sent the empty ascent stage into the Moon. The impact created vibrations that the newly installed seismic station could record, turning discarded hardware into a scientific experiment.',
    ],
    learned: [
      'Reaching Surveyor 3 demonstrated that a landing could support a specific scientific destination. During their second moonwalk, the astronauts removed parts of the older robot for examination on Earth. Those pieces offered something photographs alone could not: material that researchers could inspect directly after prolonged exposure to the lunar surface environment.',
      'The crew also collected rocks and deployed a larger experiment package than Apollo 11 had carried. The instruments continued observations long after Intrepid left, with the station shut down in 1977. The mission therefore left two kinds of legacy: returned samples and hardware available for laboratory study, and years of measurements sent home from equipment that remained on the Moon.',
    ],
  },
  'apollo-15': {
    idea: 'Apollo 15 expanded lunar exploration from a short visit near a lander into a wider geological investigation. David Scott and James Irwin landed Falcon beside the Apennine Mountains and Hadley Rille, a winding channel in the lunar landscape. These surroundings offered different kinds of terrain to compare, but reaching them on foot would limit the work. A rover and a longer surface stay gave the astronauts more opportunities to examine rocks in context, collect samples, and install experiments before returning to orbit.',
    craft: [
      'Falcon carried a Lunar Roving Vehicle in its descent stage along with the equipment needed for surface work. Once deployed, the electric rover transported the astronauts, their tools, and their samples. Mobility changed how the mission could be planned: the crew could investigate several locations instead of concentrating only on the immediate surroundings of the lander.',
      'The lunar module remained the base to which each excursion returned. Its cabin provided the protected working and living space, while the descent stage supported the return launch. The rover could extend the journey across the ground, but it could not leave the Moon. Both it and Falcon’s lower stage stayed behind when the astronauts lifted off.',
    ],
    learned: [
      'Across three moonwalks, Scott and Irwin investigated mountain slopes, craters, and the edge of Hadley Rille. Bringing samples home with photographs and descriptions of their locations gave scientists more than a collection of loose rocks. The surrounding terrain helped researchers connect individual specimens to the processes that shaped this part of the Moon.',
      'The crew also deployed surface instruments that continued measuring after departure; the experiment station was shut down in 1977. Apollo 15 showed how mobility, observation, and laboratory analysis could complement one another. The rover remains at the landing site, but the samples and recorded observations can be reexamined as scientists develop new techniques and questions about lunar history.',
    ],
  },
  'surveyor-3': {
    idea: 'Before astronauts could safely explore the Moon, engineers needed direct evidence about the ground beneath a lander’s feet. Photographs showed craters and plains, but could not fully establish how loose surface material would behave under a load. Surveyor 3 carried a mechanical sampler to press, dig, and move lunar soil while a camera watched. Its task was both scientific and practical: describe an unfamiliar surface and help determine whether it could support the much larger lunar module that would carry an Apollo crew.',
    craft: [
      'Surveyor 3 worked as a stationary robotic testing station. Its sampling arm could reach away from the spacecraft, excavate shallow trenches, and push against the soil. A movable camera system observed the surrounding terrain and the sampler’s work. Commands from Earth directed a sequence of tests, allowing researchers to compare the ground before and after each disturbance.',
      'Touchdown itself exposed an engineering difficulty. Reflective rocks confused the descent radar, and the spacecraft bounced twice before settling. Despite this rough arrival, it returned thousands of images and performed soil tests. The combination of pictures and physical contact made its findings more useful for landing design than either a distant image or an isolated measurement alone.',
    ],
    learned: [
      'The sampler showed that the soil at the site could bear the load of an Apollo lunar module. That was valuable evidence for planning crewed landings, although one location could not describe every part of the Moon. The camera also documented how disturbed material looked, helping connect measured soil behavior with features visible in photographs.',
      'Apollo 12 later landed nearby, and its astronauts recovered the camera, scoop, and other parts for study on Earth. The visit gave Surveyor 3 a second scientific role after its own transmissions had ended. Researchers could examine how actual flight hardware had endured nearly two and a half years on the Moon, while most of the lander remained at the site.',
    ],
  },
  'viking-1': {
    idea: 'Viking 1 approached Mars as a world that needed to be studied at several scales. An orbiter would survey broad regions, while a lander would investigate one place in detail, including experiments related to the possibility of life. Reaching the surface safely was itself a major challenge. Images taken after arrival revealed that the original landing area was rougher than expected, so the team selected a different site. The mission’s science depended on turning distant reconnaissance into decisions about where to touch down.',
    craft: [
      'The orbiter and lander divided the work. From above, cameras could place the landing region within the larger Martian landscape. On the surface, the lander’s cameras, weather sensors, and sampling arm examined conditions directly. The arm delivered soil to instruments inside the spacecraft, allowing chemical investigations that photographs alone could never provide.',
      'The lander generated electricity from heat released by radioactive material, while the orbiter used solar power. That difference supported distinct operating needs. Viking 1 remained a stationary laboratory rather than a rover: it repeatedly observed the same surroundings and weather. Its long operation gave scientists a record of changes through time at a known location.',
    ],
    learned: [
      'Viking returned detailed surface views, soil measurements, and years of weather observations. Its biological experiments produced results that required careful interpretation: some reactions appeared suggestive, while a separate search for organic compounds gave negative results. Taken together, the measurements did not settle whether Mars ever hosted life. An intriguing chemical response was not enough to establish a biological explanation.',
      'That uncertainty became part of the mission’s scientific value. It showed why future investigations needed to understand the environment and its chemistry as well as look for possible life. Viking 1’s lander continued operating until communications were lost in 1982. The hardware stayed on Mars, while its observations established a foundation for later surface exploration.',
    ],
  },
  'mars-pathfinder': {
    idea: 'Mars Pathfinder tested whether a relatively small mission could deliver both a stationary science platform and a mobile explorer to Mars. Its rover, Sojourner, would investigate rocks beyond the lander’s immediate reach. First, both machines had to survive arrival through a thin atmosphere and a touchdown on uneven ground. Pathfinder used airbags to cushion that final encounter. Success would demonstrate a new landing approach and show that a rover could make useful measurements while working alongside a lander on another planet.',
    craft: [
      'A parachute slowed Pathfinder during descent, and an enclosing system of airbags protected the spacecraft as it struck the surface and bounced. After coming to rest, the lander opened to release Sojourner. Designing for a bouncing arrival meant that the instruments and rover had to reach the ground inside a protective package before beginning their work.',
      'The two vehicles then provided complementary observations. The lander photographed the wider scene and measured atmospheric conditions, while Sojourner approached individual rocks and examined their composition. Its small size limited the area it could explore, but movement still mattered: researchers could compare separate targets rather than accept only the material within reach of a fixed sampling arm.',
    ],
    learned: [
      'Rounded pebbles and other features at the landing site suggested that flowing water had helped shape the landscape in the past. Chemical measurements added information about the rocks and soil, while weather observations documented dust, clouds, and temperature changes. Together, these findings helped connect the surface’s geological history with the environment the instruments measured.',
      'These clues did not demonstrate that life had existed. They helped scientists investigate past conditions and identify better questions for later missions. Pathfinder also delivered an engineering result: a rover and lander could operate together successfully on Mars. Their final data transmission came in September 1997, leaving both machines at the site but preserving observations that later explorers could build upon.',
    ],
  },
  'mars-exploration-rovers': {
    idea: 'Spirit and Opportunity were sent to separate regions of Mars to investigate a shared question: how had water shaped the planet’s past? A view from orbit could identify promising terrain, but close examination was needed to connect rock textures, minerals, and surrounding layers. Two rovers offered a way to compare different environments rather than rely on a single landing site. Their mobility allowed scientists to follow new clues across the landscape, making each drive part of a continuing geological investigation.',
    craft: [
      'Spirit and Opportunity carried cameras for surveying terrain and instruments for examining rocks at close range. A robotic arm positioned tools against selected targets, including a device that could grind away an outer surface. Looking beneath weathered material helped scientists compare a rock’s interior with the coating exposed to the Martian environment.',
      'The instruments worked as a sequence rather than as isolated gadgets. Broad views helped the team choose a destination, closer images revealed textures, and chemical measurements tested interpretations. Driving connected those observations across several locations. Because the twin rovers explored different regions, their similar equipment also made it possible to compare evidence collected far apart on the planet.',
    ],
    learned: [
      'Opportunity investigated small mineral-rich spheres containing hematite, an iron mineral, alongside other evidence of an ancient watery environment. Spirit encountered soil unusually rich in silica, which pointed to water-related processes under different conditions. These distinct findings showed why exploring more than one region mattered: Mars did not preserve only a single story of water.',
      'The rock record indicated that water had persisted on parts of ancient Mars, but water alone does not prove life. Researchers also needed to understand factors such as chemistry and environmental change. The rovers helped turn a broad search for water into more detailed questions about past habitability, meaning whether an environment could have supported living organisms.',
    ],
  },
  insight: {
    idea: 'InSight explored Mars by studying what could not be seen in a surface photograph. Its goal was to investigate the planet’s interior and the processes that shaped rocky worlds. Instead of driving toward interesting rocks, the lander stayed on a relatively flat plain where it could deploy sensitive instruments. Vibrations from marsquakes would carry information about material below the surface. Detecting those faint signals, and separating them from local disturbances, offered a way to investigate layers that no rover could directly reach.',
    craft: [
      'InSight used a robotic arm to place a seismometer on the ground. This instrument measured tiny motions, allowing scientists to record vibrations passing through Mars. A protective cover helped reduce interference from wind and changing temperatures. The quiet, fixed observing position was central to the mission: movement across the landscape was unnecessary for listening to the planet.',
      'The lander also carried a heat probe and equipment for radio measurements. The probe was intended to burrow underground, but unexpected soil conditions prevented it from reaching its planned depth. That limitation is part of the engineering story. A successful landing and working electronics did not guarantee that every instrument could operate as intended.',
    ],
    learned: [
      'Marsquakes provided evidence about the crust, mantle, and core: the outer rocky shell, the material beneath it, and the central region. Different vibration paths helped researchers investigate those hidden layers. InSight also detected shaking from meteoroid impacts, connecting events at the surface with signals recorded by a single sensitive station.',
      'The heat experiment could not complete its intended deep measurement, so the mission’s achievements should not be confused with all of its original goals. Dust gradually reduced the electricity available from its solar panels, and contact ended in December 2022. The lander and deployed instruments remain on Mars, while their recorded signals continue to support studies of the planet’s interior.',
    ],
  },
  ingenuity: {
    idea: 'Ingenuity asked whether powered, controlled flight could work in the very thin atmosphere of Mars. A rotor has much less air to push against there than on Earth, even though the weaker gravity helps reduce the weight it must lift. The helicopter also had to operate far beyond the reach of live piloting. Carried to Mars by Perseverance, it began as a small technology demonstration: prove that a lightweight aircraft could take off, remain stable, and land under its own control.',
    craft: [
      'Ingenuity paired a lightweight body with large, fast-spinning rotors that produced lift in the thin air. A solar panel recharged its batteries between flights. Energy had to support more than flying: the helicopter also needed to protect its electronics through cold nights. These requirements made mass, available power, and flight duration closely connected design choices.',
      'Controllers sent instructions in advance, and onboard systems guided each flight. The communication delay between Earth and Mars ruled out steering it moment by moment with a joystick. Perseverance helped relay information. This arrangement made autonomy, the ability to carry out actions without continuous human control, just as essential to the demonstration as the rotor blades themselves.',
    ],
    learned: [
      'Designed for no more than five initial tests, Ingenuity completed 72 flights. Its role expanded from proving that flight was possible to providing aerial views useful to scientists and rover planners. Images from above offered a different perspective on terrain that a rover would otherwise have to assess mainly from ground level.',
      'The last flight took place in January 2024, and damage to its rotor blades ended flying operations. Ingenuity was a technology demonstrator rather than a laboratory searching for life. Its legacy lies in evidence about operating aircraft on another world: how to navigate, scout, and manage practical limits. Those lessons can inform future designs without assuming every destination will offer the same flying conditions.',
    ],
  },
  'pioneer-10': {
    idea: 'Pioneer 10 ventured beyond the region explored by earlier planetary spacecraft, crossing the main asteroid belt on its way to Jupiter. Engineers needed to discover whether a probe could survive that journey and work within the giant planet’s intense radiation environment. Scientists wanted close observations of Jupiter and measurements of the surrounding space. The mission also stretched communication across enormous distances, where commands and replies could not be exchanged instantly. Its flyby would help establish both the possibilities and hazards of outer-planet exploration.',
    craft: [
      'The probe carried instruments to measure particles, magnetic fields, and other conditions along its path, as well as equipment to image Jupiter. Electrical power came from generators that converted heat from radioactive decay into electricity. This allowed operation far from the Sun, where the available sunlight is much weaker than it is near Earth.',
      'A radio link connected these measurements to scientists at home, but increasing distance meant longer waits for signals. The spacecraft continued outward after its Jupiter encounter rather than entering orbit around the planet. Its design therefore supported a moving investigation: a brief close encounter followed by years of measurements through regions farther from the Sun.',
    ],
    learned: [
      'Pioneer 10 became the first spacecraft to fly by Jupiter and provided direct measurements of its harsh surroundings. Radiation affected the spacecraft during the encounter, showing that the environment was an engineering concern as well as a scientific target. Images and instrument readings gave later missions information unavailable from Earth-based observations alone.',
      'The probe also demonstrated that a spacecraft could cross the asteroid belt and continue operating far beyond its original mission. Its final signal reached Earth in 2003 as declining electrical power limited communication. Unlike a retired lander, Pioneer 10 left no surface station: it continued along an outward trajectory, carrying the physical record of an early journey to the outer planets.',
    ],
  },
  'near-shoemaker': {
    idea: 'NEAR Shoemaker set out to study Eros as a small world with a shape, surface, composition, and gravitational environment of its own. A quick flyby could reveal only part of that picture. Remaining nearby would allow repeated measurements from different directions and distances. Getting into orbit required careful navigation, and an interrupted engine burn forced the team to revise its arrival plans. The mission eventually turned a distant point of light into a mapped landscape, then attempted an unexpected final step onto the surface.',
    craft: [
      'NEAR used a camera, a laser rangefinder, and instruments that examined light and radiation to study Eros. The rangefinder measured distance to the surface, helping describe the asteroid’s shape. Other observations investigated composition and gravity. Changing the orbit during the mission let the team gather broad coverage and then examine selected terrain from closer viewpoints.',
      'The spacecraft was designed as an orbiter, not a lander. After its extended survey, controllers arranged a slow descent while the camera returned increasingly detailed images. Touchdown was therefore an opportunity to extend a completed investigation rather than the original basis of the design. Remarkably, the spacecraft survived contact and continued transmitting measurements from the ground.',
    ],
    learned: [
      'The mission mapped Eros in detail, revealing craters, ridges, and variations across an irregular surface. Measurements also helped researchers investigate its composition and internal mass distribution. Combining these observations mattered: appearance alone could not explain what the asteroid was made of or how material was arranged beneath its visible terrain.',
      'NEAR became the first spacecraft to orbit and then land on an asteroid. It returned data for about two weeks after touchdown, including measurements from its gamma-ray instrument, before contact ended in February 2001. Its resting place marks a new kind of exploration, while the data demonstrate how repeated close observations can transform a small body into a world scientists can investigate systematically.',
    ],
  },
  dawn: {
    idea: 'Dawn was designed to compare Vesta and Ceres, two large bodies in the main asteroid belt that preserve different clues to the early solar system. Visiting both with one spacecraft allowed scientists to investigate why neighboring worlds developed differently. That required more than two brief flybys: Dawn needed to enter orbit, spend time mapping each destination, and travel between them. The mission combined a demanding journey with a comparative question about how rocky and water-rich bodies formed and changed over time.',
    craft: [
      'Dawn used ion propulsion, which accelerates electrically charged particles to produce thrust. The push was gentle, but applying it over long periods allowed large changes in the spacecraft’s path while using propellant efficiently. Solar arrays supplied electricity for the spacecraft and its engines. This approach made extended visits to two separate destinations possible.',
      'Cameras and other instruments mapped the worlds from orbit, connecting surface appearance with measurements of composition. Dawn could change its observing distance to build both broad and detailed views. It also needed separate fuel to control its orientation. When that supply ran out, the spacecraft could no longer reliably point its antenna toward Earth or its solar panels toward the Sun.',
    ],
    learned: [
      'Vesta revealed a history of heating and differentiation, the separation of a body into distinct internal layers. Ceres presented a different picture, including evidence of water-related chemistry and bright salt deposits. Comparing the two showed that objects sharing the asteroid belt could preserve very different records of planetary development and change.',
      'These findings made small worlds important laboratories for understanding the solar system’s beginnings. Evidence involving water on Ceres did not establish life; it helped identify processes and environments worth investigating. Dawn’s mission ended in 2018, leaving the spacecraft in orbit around Ceres. Its maps and measurements remain available for comparisons that extend well beyond the lifetime of the observing hardware.',
    ],
  },
  kepler: {
    idea: 'Kepler searched for exoplanets, planets orbiting stars beyond the Sun, by measuring tiny changes in starlight. A planet is usually difficult to see beside its much brighter star, but it can briefly block some light when it crosses in front. Watching many stars repeatedly made those subtle patterns detectable. The challenge was to keep measurements stable long enough to recognize repeated events and distinguish promising planet signals from other changes. The goal was a broader picture of how common other worlds might be.',
    craft: [
      'Kepler was built around a telescope and a large array of light-sensitive detectors. It watched a field of stars and recorded their brightness over time. A transit, when a planet crosses its star as seen by the telescope, creates a small dip. Repeated observations helped researchers identify patterns rather than rely on a single dimming event.',
      'Precise pointing was essential. After a second reaction wheel, a device used to control orientation, failed in 2013, Kepler could no longer maintain its original observing strategy. Engineers developed K2, using the pressure of sunlight to help balance the spacecraft. The telescope observed successive fields instead of continuously watching the same original patch of sky.',
    ],
    learned: [
      'Kepler revealed a galaxy rich in planets and planetary systems unlike our own. Many discoveries fell between Earth and Neptune in size, a category missing from the solar system. Its observations helped scientists move from finding individual unusual objects toward asking how different sizes and arrangements of planets are distributed among stars.',
      'A planet’s size and orbit do not by themselves show that it has water or life. Even a location where surface water might be possible depends on other conditions, including the atmosphere. Kepler and K2 supplied targets and statistical evidence for further investigation. Fuel exhaustion ended observations in 2018, but the archived measurements allow research to continue after the telescope’s retirement.',
    ],
  },
};
type QuizSeed = [string, string, string, string, string];
const quizSeeds: Record<string, [QuizSeed, QuizSeed, QuizSeed]> = {
  'apollo-11': [
    ['What was Eagle’s biggest challenge?', 'Land astronauts and bring them back to lunar orbit', 'Build a permanent Moon base', 'Photograph Jupiter', 'Eagle had to land safely and lift the crew back to their waiting spacecraft.'],
    ['Why did Eagle have two sections?', 'The lower part could stay as a launchpad', 'One section was for swimming', 'The sections landed on different moons', 'The descent section stayed on the Moon while the upper cabin carried the crew up.'],
    ['What did the experiments left on the Moon do?', 'Keep gathering measurements after the crew left', 'Grow food for the astronauts', 'Power the rover', 'The instruments continued to teach scientists about the Moon after the visit.'],
  ],
  'apollo-12': [
    ['Why aim to land near Surveyor 3?', 'To prove a landing could be precise', 'To refuel the spacecraft', 'To look for Martian rocks', 'Landing close to the older robot showed that crews could reach a chosen site.'],
    ['What did Intrepid’s lower section become?', 'A launchpad for the return trip', 'A boat', 'A telescope', 'The descent stage stayed behind while the cabin lifted off.'],
    ['Why did astronauts bring Surveyor parts home?', 'To study equipment that had spent years on the Moon', 'To repair Surveyor in orbit', 'To make a new rocket', 'The returned parts gave scientists a rare look at hardware exposed to the lunar environment.'],
  ],
  'apollo-15': [
    ['Why take a rover to the Moon?', 'To explore farther from the landing site', 'To drive back to Earth', 'To launch the spacecraft', 'The rover gave astronauts a much larger area to investigate.'],
    ['What did the rover help carry?', 'Tools and rock samples', 'A second spacecraft', 'A swimming pool', 'It helped the crew bring equipment and samples across the lunar surface.'],
    ['Why are Apollo 15 rocks useful today?', 'They offer clues about lunar history', 'They show that the Moon has trees', 'They prove Mars has oceans', 'Scientists can keep studying those samples to learn about the Moon.'],
  ],
  'surveyor-3': [
    ['What did NASA need to know before a crewed landing?', 'Whether lunar soil could support a lander', 'Whether it rained on the Moon', 'Whether the Moon had forests', 'A lander needed ground firm enough to hold it.'],
    ['How did Surveyor 3 test the soil?', 'With a mechanical sampling arm', 'By driving a rover', 'With a parachute', 'Its arm pressed and dug into the lunar surface.'],
    ['What did the soil tests help show?', 'An Apollo lander could stand on the surface', 'The Moon was made of ice', 'No spacecraft could land there', 'The ground was firm enough to support a lunar module.'],
  ],
  'viking-1': [
    ['Why send both an orbiter and a lander?', 'To study Mars from above and on the ground', 'To visit two planets at once', 'To make Mars spin faster', 'The two spacecraft gave scientists different views of Mars.'],
    ['Which part worked on the Martian surface?', 'The lander', 'The orbiter', 'The launch rocket', 'The lander settled on Mars and used its own cameras and experiments.'],
    ['Did Viking settle whether Mars had life?', 'No, the question remained open', 'Yes, it found animals', 'Yes, it proved life was impossible', 'Viking investigated the question but did not settle it.'],
  ],
  'mars-pathfinder': [
    ['What new challenge did Pathfinder tackle?', 'Landing safely and delivering a rover', 'Flying around Jupiter', 'Bringing astronauts home', 'Pathfinder tested a landing method and carried Sojourner to Mars.'],
    ['What cushioned its landing?', 'Large airbags', 'A lake', 'A giant wing', 'Airbags let the craft bounce safely after its parachute slowed it.'],
    ['Why were rounded pebbles exciting?', 'They suggested water may once have flowed there', 'They proved Mars had trees', 'They were pieces of Earth', 'Rounded stones can be clues to flowing water in the past.'],
  ],
  'mars-exploration-rovers': [
    ['Why send two rovers to different places?', 'To compare clues from separate regions', 'To make them race', 'To build a bridge', 'Spirit and Opportunity explored different areas of Mars.'],
    ['How did the rovers study Mars?', 'They drove to rocks and tested them', 'They stayed in orbit', 'They drilled through the planet', 'Moving let each rover investigate rocks at several locations.'],
    ['What did the rock record reveal?', 'Water lasted on parts of ancient Mars', 'Mars was always covered in ice cream', 'No water had ever existed there', 'The rocks held evidence of long-standing water in the past.'],
  ],
  insight: [
    ['What part of Mars did InSight investigate?', 'Its deep interior', 'Its moons only', 'Its clouds only', 'InSight used shaking to learn about layers below the surface.'],
    ['What detected faint shaking?', 'A seismometer', 'A rover wheel', 'A parachute', 'A seismometer listens for vibrations called marsquakes.'],
    ['What can marsquakes reveal?', 'Clues about hidden layers inside Mars', 'The number of stars in the sky', 'Whether Mars has oceans today', 'Vibrations travel through the planet and help scientists study its inner structure.'],
  ],
  ingenuity: [
    ['What did Ingenuity try to prove?', 'Powered flight could work in thin Martian air', 'A helicopter could reach Earth', 'Mars had oceans', 'Ingenuity tested controlled flight in Mars’s very thin atmosphere.'],
    ['Why did Ingenuity need fast-spinning blades?', 'To make lift in thin air', 'To dig through rock', 'To send radio signals', 'The blades had to push enough air downward to lift the little craft.'],
    ['What did its many flights show?', 'Aircraft could help scout another world', 'All Mars travel must use helicopters', 'Mars has Earth-like air', 'Ingenuity showed that future explorers might use aerial scouts.'],
  ],
  'pioneer-10': [
    ['Where did Pioneer 10 make a historic flyby?', 'Jupiter', 'The Moon', 'Eros', 'Pioneer 10 became the first spacecraft to fly by Jupiter.'],
    ['What did its instruments do?', 'Measure surroundings and send findings home', 'Carry astronauts', 'Collect Martian soil', 'The probe gathered data during its long journey.'],
    ['Why did this mission matter for later probes?', 'It opened a route to the outer planets', 'It built a permanent station', 'It landed on every planet', 'Its journey showed that spacecraft could explore far beyond Mars.'],
  ],
  'near-shoemaker': [
    ['What small world did NEAR Shoemaker visit?', 'Asteroid Eros', 'The Moon', 'Ceres', 'The mission traveled to Eros to study an asteroid up close.'],
    ['What did it do before landing?', 'Orbit Eros', 'Drive across Eros', 'Fly through Jupiter', 'Repeated trips around Eros let it map the asteroid before descent.'],
    ['What did the mission show was possible?', 'Orbiting and landing on an asteroid', 'Growing forests on Eros', 'Moving Eros to Earth', 'NEAR showed that a spacecraft could circle and touch down on a small world.'],
  ],
  dawn: [
    ['Why did Dawn visit both Vesta and Ceres?', 'To compare two different small worlds', 'To look for Earth’s Moon', 'To carry astronauts to Mars', 'Comparing the worlds helped scientists study how they formed.'],
    ['How did Dawn study each world?', 'It spent extended time nearby', 'It rushed past each in seconds', 'It landed and drove a rover', 'Long stays gave Dawn time to map and measure both destinations.'],
    ['What did the comparison reveal?', 'Nearby worlds can have different histories', 'All asteroids are identical', 'Ceres is a star', 'Vesta and Ceres developed in different ways.'],
  ],
  kepler: [
    ['What was Kepler searching for?', 'Planets around other stars', 'Rocks on the Moon', 'Oceans on Mars', 'Kepler looked for exoplanets, or planets beyond our solar system.'],
    ['What clue could reveal a hidden planet?', 'A repeated tiny dip in a star’s light', 'A loud sound from the star', 'A change in Earth’s tides', 'A planet crossing in front of a star can briefly dim its light.'],
    ['What did Kepler help show?', 'Planets are common in our galaxy', 'Only our Sun has planets', 'All stars are planets', 'Kepler’s discoveries changed our picture of how many worlds exist.'],
  ],
};

const titles: Record<string, { idea: string; craft: string; learned: string }> = {
  'apollo-11': { idea: 'Could people land and return?', craft: 'A two-part Moon elevator', learned: 'A little laboratory left behind' },
  'apollo-12': { idea: 'Could NASA hit a tiny target?', craft: 'Intrepid’s clever return trip', learned: 'A visit to an older robot' },
  'apollo-15': { idea: 'How far could explorers go?', craft: 'A rover for a bigger field trip', learned: 'Rocks that tell old stories' },
  'surveyor-3': { idea: 'Would the ground hold a lander?', craft: 'A robotic scoop tests the soil', learned: 'A safer path for Apollo' },
  'viking-1': { idea: 'What was Mars really like?', craft: 'Two views of one planet', learned: 'A question still open' },
  'mars-pathfinder': { idea: 'How do you land a rover?', craft: 'A bouncing landing', learned: 'Clues left by ancient water' },
  'mars-exploration-rovers': { idea: 'Was ancient Mars wet?', craft: 'Twin explorers on the move', learned: 'The story inside the rocks' },
  insight: { idea: 'What lies inside Mars?', craft: 'Listening for marsquakes', learned: 'A planet’s hidden layers' },
  ingenuity: { idea: 'Can a helicopter fly on Mars?', craft: 'Blades built for thin air', learned: 'A new way to explore' },
  'pioneer-10': { idea: 'Could a probe reach Jupiter?', craft: 'A traveler built to keep talking', learned: 'A path to the outer planets' },
  'near-shoemaker': { idea: 'Can we visit a tiny world?', craft: 'Circling asteroid Eros', learned: 'An asteroid up close' },
  dawn: { idea: 'Why visit two small worlds?', craft: 'Time to look closely', learned: 'Two very different histories' },
  kepler: { idea: 'How do you find a hidden planet?', craft: 'Watching stars blink', learned: 'A galaxy full of worlds' },
};

type MomentSeed = [string, string, string, source?: string];
const alsepHistory = 'https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_18-31_ALSEP_Arrays_and_Status.htm';
const k2History = 'https://science.nasa.gov/mission/kepler/in-depth/';
const moments: Record<string, MomentSeed[]> = {
  'apollo-11': [
    ['July 16, 1969', 'Launch', 'Apollo 11 began the journey that would test a complete crewed landing and return. The spacecraft carried not only the astronauts but also the equipment needed to collect samples and leave scientific instruments on the Moon.'],
    ['July 20, 1969', 'Moon landing', 'Eagle reached the Sea of Tranquility with Armstrong and Aldrin aboard. A safe touchdown made surface exploration possible, but the mission still depended on a separate ascent engine returning the crew to their waiting command module.'],
    ['July 21, 1969', 'Return to orbit', 'Eagle’s upper stage lifted off while its lower stage remained as the launch platform. Rejoining Michael Collins in orbit completed the essential link between the surface visit and the crew’s journey back to Earth.'],
  ],
  'apollo-12': [
    ['Nov. 14, 1969', 'Launch', 'Apollo 12 set out to extend the achievement of the first landing with a more precise destination. The crew carried equipment for geology, longer-lasting surface experiments, and the unusual task of retrieving parts from another spacecraft.'],
    ['Nov. 19, 1969', 'Precise landing', 'Intrepid landed roughly 180 meters from Surveyor 3, close enough for the astronauts to visit on foot. That accuracy connected navigation with science: reaching a particular location made a planned investigation of older hardware possible.'],
    ['1977', 'Experiments shut down', 'The experiment station was commanded off in September, years after the crew’s departure. Its operating life illustrates how an Apollo landing could create a continuing scientific outpost, even though the astronauts stayed for only a short visit.', alsepHistory],
  ],
  'apollo-15': [
    ['July 26, 1971', 'Launch', 'Apollo 15 departed with a rover and plans for an extended surface investigation. The mission would test how increased mobility could help astronauts connect observations at several sites within a landscape of mountains, craters, and a winding channel.'],
    ['July 30, 1971', 'Falcon lands', 'Falcon reached the Hadley-Apennine region with the equipment needed for three moonwalks. Unloading the rover would turn the lander into a base for longer excursions, giving the crew access to more varied geological targets.'],
    ['1977', 'Experiments shut down', 'The surface station continued observations after Falcon’s crew returned home and was shut down in September 1977. Those years of measurements complemented the rocks and photographs brought to Earth during the much shorter human expedition.', alsepHistory],
  ],
  'surveyor-3': [
    ['April 17, 1967', 'Launch', 'Surveyor 3 left Earth carrying a camera and a surface sampler to investigate lunar soil directly. Its robotic tests would help engineers judge the ground that future Apollo crews and their heavier landing vehicles would encounter.'],
    ['April 20, 1967', 'Soft landing', 'After bouncing twice during a troubled descent, Surveyor 3 settled on the surface and began returning images. The successful arrival allowed its sampler to dig and press the soil, connecting physical tests with visual observations.'],
    ['1969', 'Apollo 12 visits', 'Conrad and Bean walked to the inactive lander and recovered selected parts. Returning that hardware to Earth allowed direct examination of material exposed to the lunar environment, extending the value of a mission whose transmissions had already ended.'],
  ],
  'viking-1': [
    ['Aug. 20, 1975', 'Launch', 'Viking 1 began its journey with an orbiter and a lander designed for complementary investigations. Reaching Mars together would allow the team to survey the destination from above before committing the surface laboratory to its landing.'],
    ['June 19, 1976', 'Mars orbit', 'Arrival in orbit gave scientists a closer look at the proposed landing area. Images showed rougher terrain than expected, prompting a new site choice and demonstrating why reconnaissance mattered to the safety of the surface mission.'],
    ['July 20, 1976', 'Touchdown', 'The lander reached Chryse Planitia and began photographing its surroundings. Surface operations opened the way for weather monitoring and soil experiments, giving researchers direct measurements to compare with the broader views supplied by the orbiter.'],
  ],
  'mars-pathfinder': [
    ['Dec. 4, 1996', 'Launch', 'Pathfinder departed with Sojourner aboard, combining a landing demonstration with a first attempt at roving on Mars. The mission would test how a small mobile explorer and a stationary platform could investigate the same environment together.'],
    ['July 4, 1997', 'Airbag landing', 'Pathfinder bounced across the surface inside protective airbags before coming to rest. Surviving that unusual arrival demonstrated a landing method that could deliver working instruments and a rover without requiring a perfectly smooth touchdown site.'],
    ['July 1997', 'Sojourner explores', 'Sojourner rolled away from the lander and began examining nearby rocks. Each new target helped demonstrate the scientific value of mobility, while the lander’s wider images supplied context for interpreting measurements made close to the ground.'],
  ],
  'mars-exploration-rovers': [
    ['June 2003', 'Spirit launches', 'Spirit began the first of two journeys aimed at investigating ancient water on Mars. Sending a mobile laboratory meant the team could examine several rocks and connect their properties to the landscape around the landing site.'],
    ['July 2003', 'Opportunity launches', 'Opportunity followed its twin toward a different region of Mars. Similar instruments at separate destinations would help researchers compare evidence, reducing the risk of treating one location’s geological history as the story of the entire planet.'],
    ['2004', 'Rovers explore', 'Both rovers began investigating their own landing regions, using images and close measurements to follow clues in the rocks. The work built a record of past water-related conditions rather than a direct test for living organisms.'],
  ],
  insight: [
    ['May 5, 2018', 'Launch', 'InSight departed with instruments intended to investigate the interior of Mars. Its fixed observing station would pursue a different kind of exploration from a rover, using signals recorded at the surface to study material hidden far below.'],
    ['Nov. 26, 2018', 'Landing', 'The lander reached Elysium Planitia, a relatively flat region selected with safety in mind. A successful touchdown provided a stable base from which its robotic arm could deploy instruments for the long work of monitoring the planet.'],
    ['2022', 'Last contact', 'Dust on the solar panels gradually reduced available electricity, and the final communication arrived in December. The end of transmissions stopped new observations but left a substantial record of seismic signals for continued study of Mars.', 'https://www.jpl.nasa.gov/news/nasa-retires-insight-mars-lander-mission-after-years-of-science/'],
  ],
  ingenuity: [
    ['April 19, 2021', 'First flight', 'Ingenuity lifted off, hovered, and returned to the ground under its own control. The short flight established that a powered aircraft could operate in the thin Martian atmosphere, turning an engineering proposal into a demonstrated capability.'],
    ['2021–2023', 'Aerial scout', 'After its initial tests, the helicopter explored how aerial images could assist rover operations. Views from above helped teams assess terrain and possible routes, while each flight added experience with autonomous navigation and the limits of the vehicle.'],
    ['Jan. 18, 2024', 'Last flight', 'Ingenuity completed its final flight, bringing the total to 72. Damage to the rotor blades ended further flying, but the accumulated images and engineering measurements preserved lessons from nearly three years of operating an aircraft on Mars.', 'https://www.jpl.nasa.gov/missions/ingenuity/'],
  ],
  'pioneer-10': [
    ['March 2, 1972', 'Launch', 'Pioneer 10 began a journey toward Jupiter and the space beyond Mars. The mission combined a planetary flyby with a practical test of whether spacecraft systems and communications could operate across much greater distances from Earth.'],
    ['July 1972', 'Asteroid belt', 'The spacecraft entered the main asteroid belt and continued gathering measurements as it crossed. Its passage provided direct experience of a region that future outer-planet missions would also need to traverse on their way outward.'],
    ['Dec. 1973', 'Jupiter flyby', 'Pioneer 10 became the first spacecraft to fly past Jupiter, returning close observations and measurements of its radiation environment. The encounter supplied both scientific discoveries and information about hazards that later spacecraft designers would need to consider.'],
  ],
  'near-shoemaker': [
    ['Feb. 17, 1996', 'Launch', 'NEAR began a journey intended to bring a spacecraft into sustained close study of an asteroid. Its instruments would connect pictures with measurements of shape, composition, and gravity, moving beyond what a brief distant view could reveal.'],
    ['2000', 'Eros orbit', 'After revised arrival plans, NEAR entered orbit around Eros in February. Remaining nearby allowed repeated observations from changing viewpoints and distances, making it possible to build a detailed account of the asteroid rather than a single flyby snapshot.'],
    ['2001', 'Eros landing', 'A controlled descent brought the orbiter onto Eros in February, even though it had not been designed as a lander. Surviving touchdown allowed additional measurements from the surface and created a new milestone in asteroid exploration.'],
  ],
  dawn: [
    ['Sept. 27, 2007', 'Launch', 'Dawn began its journey to two destinations in the asteroid belt. Its mission depended on efficient propulsion that could support extended stays in orbit, allowing scientists to compare worlds with shared surroundings but different histories.'],
    ['2011', 'Vesta', 'Dawn entered orbit around Vesta and began an extended survey of its surface and composition. Staying nearby allowed repeated mapping, supplying the first half of a comparison that would continue when the same spacecraft reached Ceres.', 'https://science.nasa.gov/mission/dawn/science/vesta/'],
    ['2015', 'Ceres', 'Arrival at Ceres gave Dawn its second destination for sustained orbital study. Comparing the dwarf planet with Vesta helped researchers investigate different evolutionary paths, including the roles of rock, internal heating, and water-related processes.', 'https://science.nasa.gov/mission/dawn/science/ceres/'],
  ],
  kepler: [
    ['March 6, 2009', 'Launch', 'Kepler began its journey to measure the brightness of distant stars with unusual precision. Repeated observations would allow researchers to search for the small, recurring dips caused when planets crossed in front of their stars.'],
    ['2009–2013', 'Planet search', 'The telescope watched its original star field for repeated changes in brightness. Collecting a long record helped distinguish recurring transit patterns from isolated events and supported a broader investigation of planetary systems beyond our own.'],
    ['May 2014', 'K2 begins', 'A new observing strategy restored useful science after the loss of precise pointing in 2013. K2 used sunlight pressure to help balance the spacecraft and observed successive fields, extending the telescope’s working life and range of targets.', k2History],
  ],
};
export function buildMissionLesson(mission: LoadedMission): MissionLesson {
  const source = mission.page.sourceUrl;
  const sources = { idea: source, craft: source, learned: source, ...sourceOverrides[mission.entry.slug] };
  const copy = narratives[mission.entry.slug];
  if (!copy) throw new Error(`${mission.entry.slug}: no lesson narrative`);
  const quiz = quizSeeds[mission.entry.slug].map((seed, index): QuizQuestion => {
    const [prompt, answer, wrong1, wrong2, feedback] = seed;
    const correct = index % 3;
    const choices = [wrong1, wrong2];
    choices.splice(correct, 0, answer);
    return { prompt, choices: choices as [string, string, string], correct, feedback, source: sources[(index === 0 ? 'idea' : index === 1 ? 'craft' : 'learned')] };
  });
  return {
    slug: mission.entry.slug,
    headings: titles[mission.entry.slug],
    idea: copy.idea,
    craft: copy.craft,
    learned: copy.learned,
    milestones: moments[mission.entry.slug].map(([date, title, explanation, reference]) => ({ date, title, explanation, source: reference || source })),
    sources, quiz,
  };
}

export function loadMissionLessons(): MissionLesson[] { return CATALOG.map(entry => buildMissionLesson(loadMission(entry.slug)!)); }
