// Grade 3 content for the main-path Spanish activities, the same shape as
// units-g1.js (see the field notes there). Written for the skill catch-up
// (services/spanish/catch-up.js) by scripts/spanish-catchup-content.js: drafted by
// DeepSeek (Standard Compute), every item checked by Mistral Large and Qwen 3.8 Max
// (xKiro); an item either rejected was rewritten and re-checked by both, or dropped.
// Reports: curriculum-build/spanish-catchup/. Do not edit by hand; re-run the build.

module.exports = [
  {
    topics: [
      { id: "subject_pronouns_and_droppin", match: /Subject Pronouns and Dropping Them/i },
      { id: "ser_present_singular_soy_ere", match: /Ser Present Singular: Soy, Eres, Es/i },
      { id: "ser_plural_forms_and_ustedes", match: /Ser Plural Forms and Ustedes/i },
      { id: "ustedes_and_vosotros_across_", match: /Ustedes and Vosotros Across Regions/i },
    ],
    "unit": "Unit 3.1",
    "grade": "advanced",
    "goal": "I can say who I am and who others are using subject pronouns and the verb ser, singular and plural.",
    "phrases": [
      {
        "id": "g3u1_soy_ana",
        "es": "Soy Ana.",
        "en": [
          "I'm Ana.",
          "I am Ana."
        ],
        "alt": [
          "Yo soy Ana."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "subject_pronouns_and_droppin"
      },
      {
        "id": "g3u1_yo_soy_de_mexico",
        "es": "Yo soy de México.",
        "en": [
          "I'm from Mexico.",
          "I am from Mexico."
        ],
        "alt": [
          "Soy de México."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "subject_pronouns_and_droppin"
      },
      {
        "id": "g3u1_ella_es_mi_amiga",
        "es": "Ella es mi amiga.",
        "en": [
          "She's my friend.",
          "She is my friend."
        ],
        "alt": [
          "Es mi amiga."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "subject_pronouns_and_droppin"
      },
      {
        "id": "g3u1_ellos_son_mis_amigos",
        "es": "Ellos son mis amigos.",
        "en": [
          "They're my friends.",
          "They are my friends."
        ],
        "alt": [
          "Son mis amigos."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "subject_pronouns_and_droppin"
      },
      {
        "id": "g3u1_soy_estudiante",
        "es": "Soy estudiante.",
        "en": [
          "I'm a student.",
          "I am a student."
        ],
        "alt": [
          "Yo soy estudiante."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "ser_present_singular_soy_ere"
      },
      {
        "id": "g3u1_es_un_libro",
        "es": "Es un libro.",
        "en": [
          "It's a book.",
          "It is a book."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "ser_present_singular_soy_ere"
      },
      {
        "id": "g3u1_eres_profesor",
        "es": "¿Eres profesor?",
        "en": [
          "Are you a teacher?"
        ],
        "alt": [
          "¿Eres profesora?",
          "¿Tú eres profesor?"
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "ser_present_singular_soy_ere"
      },
      {
        "id": "g3u1_nosotros_somos_amigos",
        "es": "Nosotros somos amigos.",
        "en": [
          "We're friends.",
          "We are friends."
        ],
        "alt": [
          "Somos amigos.",
          "Nosotras somos amigas.",
          "Somos amigas."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "ser_plural_forms_and_ustedes"
      },
      {
        "id": "g3u1_ellas_son_de_chile",
        "es": "Ellas son de Chile.",
        "en": [
          "They're from Chile.",
          "They are from Chile."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "ser_plural_forms_and_ustedes"
      },
      {
        "id": "g3u1_ustedes_son_estudiantes",
        "es": "Ustedes son estudiantes.",
        "en": [
          "You are students.",
          "You're students.",
          "You all are students."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "ser_plural_forms_and_ustedes"
      },
      {
        "id": "g3u1_ustedes_son_mis_amigos",
        "es": "Ustedes son mis amigos.",
        "en": [
          "You are my friends.",
          "You're my friends.",
          "You all are my friends."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "ser_plural_forms_and_ustedes"
      },
      {
        "id": "g3u1_ustedes_son_amigos",
        "es": "Ustedes son amigos.",
        "en": [
          "You are friends.",
          "You all are friends."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "ustedes_and_vosotros_across_"
      },
      {
        "id": "g3u1_ustedes_son_de_espana",
        "es": "Ustedes son de España.",
        "en": [
          "You are from Spain.",
          "You all are from Spain."
        ],
        "tier": 3,
        "skill": "es_ser_estar",
        "topic": "ustedes_and_vosotros_across_"
      },
      {
        "id": "g3u1_ustedes_son_de_mexico",
        "es": "Ustedes son de México.",
        "en": [
          "You are from Mexico.",
          "You all are from Mexico."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "ustedes_and_vosotros_across_"
      }
    ],
    "scene": {
      "title": "¿Quién es quién?",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Es el primer día del club de español.",
          "en": "It's the first day of the Spanish club.",
          "art": "cafe"
        },
        {
          "who": "mara",
          "es": "¡Hola! Soy Mara. ¿Y tú?",
          "en": "Hi! I'm Mara. And you?"
        },
        {
          "who": "tomas",
          "es": "Soy Tomás. Soy estudiante.",
          "en": "I'm Tomás. I'm a student."
        },
        {
          "who": "rosa",
          "es": "Él es Diego. Es mi amigo.",
          "en": "He's Diego. He's my friend."
        },
        {
          "who": "diego",
          "es": "Sí, nosotros somos amigos.",
          "en": "Yes, we're friends."
        },
        {
          "who": "mara",
          "es": "Ellas son Ana y Lucía. Son de México.",
          "en": "They're Ana and Lucía. They're from Mexico."
        }
      ],
      "questions": [
        {
          "after": 3,
          "kind": "read_respond",
          "question": "Who is the student?",
          "choices": [
            "Tomás",
            "Diego",
            "Mara"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "Who is Diego?",
          "choices": [
            "Mara's friend",
            "Rosa's friend",
            "Tomás's brother"
          ],
          "answer": 1
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "Where are Ana and Lucía from?",
          "choices": [
            "Mexico",
            "Chile",
            "Spain"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "A language meetup at a café",
      "learnerCard": "You know some people at the meetup. Tell Rosa who you are and who your friend is.",
      "learnerCardEs": "Di quién eres, de dónde eres y quién es tu amigo.",
      "partnerCard": "Rosa knows everyone at the meetup. She wants to know who you are and who your friends are.",
      "goals": [
        {
          "id": "who_am_i",
          "text": "Say who you are (Soy ...)."
        },
        {
          "id": "from_where",
          "text": "Say where you are from (Soy de ...)."
        },
        {
          "id": "my_friend",
          "text": "Say who your friend is (Él es mi amigo / Ella es mi amiga)."
        },
        {
          "id": "we_are",
          "text": "Say that you two are friends (Somos amigos)."
        }
      ],
      "targets": [
        "Soy Ana.",
        "Soy de México.",
        "Él es mi amigo.",
        "Ella es mi amiga.",
        "Somos amigos.",
        "Ustedes son mis amigos."
      ],
      "opening": "¡Hola! Yo soy Rosa. ¿Y tú?",
      "script": [
        {
          "goal": "who_am_i",
          "expect": [
            "soy",
            "yo"
          ],
          "reply": "¡Mucho gusto! Yo soy Rosa.",
          "hint": "Say \"Soy Ana.\""
        },
        {
          "goal": "from_where",
          "expect": [
            "soy",
            "de"
          ],
          "reply": "¡Qué bien! Yo soy de Colombia.",
          "hint": "Say \"Soy de México.\""
        },
        {
          "goal": "my_friend",
          "expect": [
            "es",
            "amigo",
            "amiga",
            "el",
            "ella"
          ],
          "reply": "¡Ah, sí! Es tu amigo.",
          "hint": "Say \"Él es mi amigo.\""
        },
        {
          "goal": "we_are",
          "expect": [
            "somos",
            "amigos",
            "amigas"
          ],
          "reply": "¡Qué bien! Nosotros somos amigos también.",
          "hint": "Say \"Somos amigos.\""
        }
      ],
      "nudges": {
        "who_am_i": "Di: «Soy…».",
        "from_where": "Di: «Soy de…».",
        "my_friend": "Di: «Él es mi amigo.»",
        "we_are": "Di: «Somos amigos.»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Yo",
        "after": "estudiante.",
        "choices": [
          "soy",
          "eres",
          "es"
        ],
        "answer": 0,
        "en": "I am a student."
      },
      {
        "before": "Ellas",
        "after": "de Chile.",
        "choices": [
          "somos",
          "son",
          "sois"
        ],
        "answer": 1,
        "en": "They are from Chile."
      },
      {
        "before": "Tú",
        "after": "mi amigo.",
        "choices": [
          "soy",
          "eres",
          "es"
        ],
        "answer": 1,
        "en": "You are my friend."
      },
      {
        "before": "Nosotros",
        "after": "amigos.",
        "choices": [
          "somos",
          "son",
          "es"
        ],
        "answer": 0,
        "en": "We are friends."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¡Hola! Yo soy Rosa. ¿Y tú?"
          }
        ],
        "choices": [
          "Soy Ana.",
          "Ella es Ana.",
          "Eres Ana."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Ustedes son de México?"
          }
        ],
        "choices": [
          "Sí, somos de México.",
          "Sí, ellos son de México.",
          "Sí, soy de México."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara y Rosa son amigas. Ellas son de México. Tomás es su amigo nuevo. Él es de Chile.",
        "question": "Where is Tomás from?",
        "choices": [
          "Chile",
          "Mexico",
          "Spain"
        ],
        "answer": 0
      },
      {
        "passage": "—Hola, soy Diego. ¿Ustedes son estudiantes? —Sí, nosotros somos estudiantes.",
        "question": "What do the students answer?",
        "choices": [
          "Yes, we are students.",
          "No, we are teachers.",
          "Yes, you are students."
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "noun_gender_with_o_and_a", match: /Noun Gender with -o and -a/i },
      { id: "gender_patterns_and_common_e", match: /Gender Patterns and Common Exceptions/i },
      { id: "making_nouns_plural", match: /Making Nouns Plural/i },
      { id: "tricky_plurals_jovenes_exame", match: /Tricky Plurals: Jóvenes, Exámenes, Los García/i },
    ],
    "unit": "Unit 3.2",
    "grade": "advanced",
    "goal": "I can identify nouns as masculine or feminine and make them plural when naming things.",
    "phrases": [
      {
        "id": "g3u2_el_libro",
        "es": "el libro",
        "en": [
          "the book"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "noun_gender_with_o_and_a",
        "art": "libro"
      },
      {
        "id": "g3u2_la_casa",
        "es": "la casa",
        "en": [
          "the house"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "noun_gender_with_o_and_a",
        "art": "casa"
      },
      {
        "id": "g3u2_el_amigo",
        "es": "el amigo",
        "en": [
          "the friend"
        ],
        "alt": [
          "la amiga"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "noun_gender_with_o_and_a"
      },
      {
        "id": "g3u2_la_amiga",
        "es": "la amiga",
        "en": [
          "the friend"
        ],
        "alt": [
          "el amigo"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "noun_gender_with_o_and_a"
      },
      {
        "id": "g3u2_el_problema",
        "es": "el problema",
        "en": [
          "the problem"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "gender_patterns_and_common_e"
      },
      {
        "id": "g3u2_la_cancion",
        "es": "la canción",
        "en": [
          "the song"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "gender_patterns_and_common_e"
      },
      {
        "id": "g3u2_la_ciudad",
        "es": "la ciudad",
        "en": [
          "the city",
          "the town"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "gender_patterns_and_common_e"
      },
      {
        "id": "g3u2_el_dia",
        "es": "el día",
        "en": [
          "the day"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "gender_patterns_and_common_e"
      },
      {
        "id": "g3u2_la_mano",
        "es": "la mano",
        "en": [
          "the hand"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "gender_patterns_and_common_e"
      },
      {
        "id": "g3u2_los_libros",
        "es": "los libros",
        "en": [
          "the books"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "making_nouns_plural"
      },
      {
        "id": "g3u2_las_casas",
        "es": "las casas",
        "en": [
          "the houses"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "making_nouns_plural"
      },
      {
        "id": "g3u2_los_lapices",
        "es": "los lápices",
        "en": [
          "the pencils"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "making_nouns_plural"
      },
      {
        "id": "g3u2_las_canciones",
        "es": "las canciones",
        "en": [
          "the songs"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "making_nouns_plural"
      },
      {
        "id": "g3u2_los_jovenes",
        "es": "los jóvenes",
        "en": [
          "the young people",
          "the teenagers",
          "the youths"
        ],
        "tier": 3,
        "skill": "es_gender",
        "topic": "tricky_plurals_jovenes_exame"
      },
      {
        "id": "g3u2_los_examenes",
        "es": "los exámenes",
        "en": [
          "the exams",
          "the tests",
          "the examinations"
        ],
        "tier": 3,
        "skill": "es_gender",
        "topic": "tricky_plurals_jovenes_exame"
      },
      {
        "id": "g3u2_los_garcia",
        "es": "los García",
        "en": [
          "the Garcías",
          "the García family"
        ],
        "tier": 3,
        "skill": "es_gender",
        "topic": "tricky_plurals_jovenes_exame"
      }
    ],
    "scene": {
      "title": "El problema de las listas",
      "art": "libro",
      "lines": [
        {
          "who": "mara",
          "es": "Mi lista: el libro, la casa y el día.",
          "en": "My list: the book, the house and the day.",
          "art": "libro"
        },
        {
          "who": "tomas",
          "es": "Mi lista: los libros, las casas y los días.",
          "en": "My list: the books, the houses and the days."
        },
        {
          "who": "rosa",
          "es": "¡Qué bien! Una lista en singular.",
          "en": "How nice! A list with singular nouns."
        },
        {
          "who": "diego",
          "es": "Y la otra en plural.",
          "en": "And the other one in plural."
        },
        {
          "who": "mara",
          "es": "El día es masculino.",
          "en": "The day is masculine."
        },
        {
          "who": "tomas",
          "es": "Sí, y la mano es femenina.",
          "en": "Yes, and the hand is feminine."
        },
        {
          "who": "rosa",
          "es": "¡Muy bien! Hay un pequeño problema: las dos listas son correctas.",
          "en": "Very good! There is a small problem: both lists are correct."
        }
      ],
      "questions": [
        {
          "after": 1,
          "kind": "read_respond",
          "question": "What is on Mara's list?",
          "choices": [
            "The book, the house and the day",
            "Books, houses and days",
            "Only pencils"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How is Tomás's list different?",
          "choices": [
            "It is in plural",
            "It is in singular",
            "It is in English"
          ],
          "answer": 0
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "Which word is feminine?",
          "choices": [
            "la mano",
            "el día",
            "el libro"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "You and Diego each have half of a household inventory list. You compare items and counts.",
      "learnerCard": "You have half of the inventory. Name your items, say if they are masculine or feminine, give counts, and ask Diego about his list.",
      "learnerCardEs": "Tienes la otra lista. Compara los objetos con Diego.",
      "partnerCard": "Diego has the other half of the inventory. He names his items and asks about yours.",
      "goals": [
        {
          "id": "list_items",
          "text": "Name two things on your list (Tengo dos libros / Tengo una casa)."
        },
        {
          "id": "say_gender",
          "text": "Say if an item is masculine or feminine (el libro es masculino / la casa es femenina)."
        },
        {
          "id": "count_plural",
          "text": "Say how many, in plural (Tengo tres libros / Tengo dos casas)."
        },
        {
          "id": "ask_back",
          "text": "Ask Diego about his list (¿Y tu lista? / ¿Cuántos libros tienes?)."
        }
      ],
      "targets": [
        "Tengo dos libros.",
        "Tengo una casa.",
        "El libro es masculino.",
        "La casa es femenina.",
        "Tengo tres libros.",
        "¿Y tu lista?"
      ],
      "opening": "Yo tengo mi lista. ¿Qué tienes en tu lista?",
      "script": [
        {
          "goal": "list_items",
          "expect": [
            "tengo",
            "libro",
            "casa"
          ],
          "reply": "¡Bien! Yo tengo dos lápices en mi lista.",
          "hint": "Say \"Tengo dos libros y una casa.\""
        },
        {
          "goal": "say_gender",
          "expect": [
            "masculin",
            "femenin",
            "libro"
          ],
          "reply": "Sí, el libro es masculino y la casa es femenina.",
          "hint": "Say \"El libro es masculino.\""
        },
        {
          "goal": "count_plural",
          "expect": [
            "tengo",
            "tres",
            "libros"
          ],
          "reply": "¡Tres libros! Yo tengo cuatro libros.",
          "hint": "Say \"Tengo tres libros.\""
        },
        {
          "goal": "ask_back",
          "expect": [
            "tu",
            "lista",
            "cuantos"
          ],
          "reply": "Mi lista tiene dos lápices y una casa.",
          "hint": "Say \"¿Y tu lista? ¿Cuántos libros tienes?\""
        }
      ],
      "nudges": {
        "list_items": "Di dos cosas de tu lista.",
        "say_gender": "Di el género de un objeto.",
        "count_plural": "Di un número y el plural.",
        "ask_back": "Pregúntale a Diego por su lista."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Gracias! Las dos listas son completas. ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "El ",
        "after": " es masculino.",
        "choices": [
          "libro",
          "casa",
          "mano"
        ],
        "answer": 0,
        "en": "The book is masculine."
      },
      {
        "before": "La ",
        "after": " es femenina.",
        "choices": [
          "día",
          "mano",
          "problema"
        ],
        "answer": 1,
        "en": "The hand is feminine."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿El libro es masculino o femenino?"
          }
        ],
        "choices": [
          "Es masculino.",
          "Es femenina.",
          "Son masculinos."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Y la mano?"
          }
        ],
        "choices": [
          "La mano es femenina.",
          "El mano es masculino.",
          "Las manos es femenina."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara tiene una lista: tres libros y una casa. Los libros son masculinos y la casa es femenina.",
        "question": "Which word is masculine?",
        "choices": [
          "libro",
          "casa",
          "lista"
        ],
        "answer": 0
      },
      {
        "passage": "Tomás tiene dos lápices y tres canciones. Los lápices son pequeños. Las canciones son bonitas.",
        "question": "How many songs does Tomás have?",
        "choices": [
          "Three",
          "Two",
          "Five"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "definite_articles_el_la_los_", match: /Definite Articles: El, La, Los, Las/i },
      { id: "indefinite_articles_un_una_u", match: /Indefinite Articles: Un, Una, Unos, Unas/i },
      { id: "numbers_21_to_100", match: /Numbers 21 to 100/i },
      { id: "hearing_numbers_apart_trece_", match: /Hearing Numbers Apart: Trece and Treinta, Sesenta and Setenta/i },
    ],
    "unit": "Unit 3.3",
    "grade": "advanced",
    "goal": "I can use definite and indefinite articles and count from 21 to 100 when talking about things.",
    "phrases": [
      {
        "id": "g3u3_el_libro",
        "es": "el libro",
        "en": [
          "the book"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "definite_articles_el_la_los_",
        "art": "libro"
      },
      {
        "id": "g3u3_la_mesa",
        "es": "la mesa",
        "en": [
          "the table"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "definite_articles_el_la_los_",
        "art": "mesa"
      },
      {
        "id": "g3u3_los_libros",
        "es": "los libros",
        "en": [
          "the books"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "definite_articles_el_la_los_",
        "art": "libro"
      },
      {
        "id": "g3u3_las_mesas",
        "es": "las mesas",
        "en": [
          "the tables"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "definite_articles_el_la_los_",
        "art": "mesa"
      },
      {
        "id": "g3u3_un_libro",
        "es": "un libro",
        "en": [
          "a book"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "indefinite_articles_un_una_u",
        "art": "libro"
      },
      {
        "id": "g3u3_una_mesa",
        "es": "una mesa",
        "en": [
          "a table"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "indefinite_articles_un_una_u",
        "art": "mesa"
      },
      {
        "id": "g3u3_unas_amigas",
        "es": "unas amigas",
        "en": [
          "some female friends"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "indefinite_articles_un_una_u"
      },
      {
        "id": "g3u3_es_un_profesor",
        "es": "Es un profesor.",
        "en": [
          "He is a teacher.",
          "He's a teacher."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "indefinite_articles_un_una_u"
      },
      {
        "id": "g3u3_veintiuno",
        "es": "veintiuno",
        "en": [
          "twenty-one"
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "numbers_21_to_100"
      },
      {
        "id": "g3u3_treinta_y_cinco",
        "es": "treinta y cinco",
        "en": [
          "thirty-five"
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "numbers_21_to_100"
      },
      {
        "id": "g3u3_cincuenta",
        "es": "cincuenta",
        "en": [
          "fifty"
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "numbers_21_to_100"
      },
      {
        "id": "g3u3_noventa_y_nueve",
        "es": "noventa y nueve",
        "en": [
          "ninety-nine"
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "numbers_21_to_100"
      },
      {
        "id": "g3u3_trece",
        "es": "trece",
        "en": [
          "thirteen"
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "hearing_numbers_apart_trece_"
      },
      {
        "id": "g3u3_treinta",
        "es": "treinta",
        "en": [
          "thirty"
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "hearing_numbers_apart_trece_"
      },
      {
        "id": "g3u3_sesenta",
        "es": "sesenta",
        "en": [
          "sixty"
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "hearing_numbers_apart_trece_"
      },
      {
        "id": "g3u3_setenta",
        "es": "setenta",
        "en": [
          "seventy"
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "hearing_numbers_apart_trece_"
      }
    ],
    "scene": {
      "title": "En el almacén",
      "art": "libro",
      "lines": [
        {
          "who": "mara",
          "es": "Buenos días. Necesito libros para la oficina.",
          "en": "Good morning. I need books for the office.",
          "art": "libro"
        },
        {
          "who": "tomas",
          "es": "Hay treinta y cinco libros aquí.",
          "en": "There are thirty-five books here."
        },
        {
          "who": "mara",
          "es": "¿Y las mesas?",
          "en": "And the tables?"
        },
        {
          "who": "tomas",
          "es": "Hay una mesa y unas sillas.",
          "en": "There is a table and some chairs."
        },
        {
          "who": "diego",
          "es": "Necesitamos noventa y nueve libros.",
          "en": "We need ninety-nine books."
        },
        {
          "who": "mara",
          "es": "Son muchos libros.",
          "en": "That's a lot of books."
        },
        {
          "who": "mara",
          "es": "Perfecto. ¡Gracias!",
          "en": "Perfect. Thanks!"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "How many books are there here?",
          "choices": [
            "Thirty-five",
            "Ninety-nine",
            "Sixty"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What does Tomás say there is besides a table?",
          "choices": [
            "Some notebooks",
            "Some chairs",
            "Some pens"
          ],
          "answer": 1
        }
      ]
    },
    "convo": {
      "partner": "tomas",
      "partnerName": "Tomás",
      "setting": "The stationery stock room. Tomás knows every quantity; you know what your office needs.",
      "learnerCard": "You work in an office. Ask Tomás what is in the stock room, say how many books you need, ask for a table, and ask about the notebooks.",
      "learnerCardEs": "Pide libros, una mesa y cuadernos. Usa los números y los artículos.",
      "partnerCard": "Tomás runs the stationery stock room and knows all the quantities.",
      "goals": [
        {
          "id": "ask_what",
          "text": "Ask what there is in the stock room (¿Qué hay?)"
        },
        {
          "id": "need_books",
          "text": "Say you need thirty-five books (Necesito treinta y cinco libros.)"
        },
        {
          "id": "need_table",
          "text": "Say you need a table (Necesito una mesa.)"
        },
        {
          "id": "ask_number",
          "text": "Ask how many notebooks there are (¿Cuántos cuadernos hay?)"
        }
      ],
      "targets": [
        "¿Qué hay?",
        "Necesito treinta y cinco libros.",
        "Necesito una mesa.",
        "¿Cuántos cuadernos hay?",
        "Hay noventa y nueve cuadernos."
      ],
      "opening": "¡Hola! ¿Qué necesitas para la oficina?",
      "script": [
        {
          "goal": "ask_what",
          "expect": [
            "que",
            "hay"
          ],
          "reply": "Hay libros, mesas y sillas.",
          "hint": "Say \"¿Qué hay aquí?\""
        },
        {
          "goal": "need_books",
          "expect": [
            "necesit",
            "treinta",
            "cinco",
            "libro"
          ],
          "reply": "Treinta y cinco libros. Aquí hay treinta y cinco.",
          "hint": "Say \"Necesito treinta y cinco libros.\""
        },
        {
          "goal": "need_table",
          "expect": [
            "necesit",
            "una",
            "mesa"
          ],
          "reply": "Hay una mesa. ¿Necesitas sillas también?",
          "hint": "Say \"Necesito una mesa.\""
        },
        {
          "goal": "ask_number",
          "expect": [
            "cuant",
            "cuaderno",
            "hay"
          ],
          "reply": "Hay noventa y nueve cuadernos.",
          "hint": "Say \"¿Cuántos cuadernos hay?\""
        }
      ],
      "nudges": {
        "ask_what": "Pregunta: ¿Qué hay aquí?",
        "need_books": "Di: Necesito treinta y cinco libros.",
        "need_table": "Di: Necesito una mesa.",
        "ask_number": "Pregunta: ¿Cuántos cuadernos hay?"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡De nada! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Necesito",
        "after": "libro.",
        "choices": [
          "un",
          "una",
          "unas"
        ],
        "answer": 0,
        "en": "I need a book."
      },
      {
        "before": "",
        "after": "mesas son grandes.",
        "choices": [
          "El",
          "La",
          "Las"
        ],
        "answer": 2,
        "en": "The tables are big."
      },
      {
        "before": "Hay",
        "after": "sillas.",
        "choices": [
          "una",
          "unas",
          "un"
        ],
        "answer": 1,
        "en": "There are some chairs."
      },
      {
        "before": "Cincuenta más cuarenta son",
        "after": ".",
        "choices": [
          "noventa",
          "setenta",
          "sesenta"
        ],
        "answer": 0,
        "en": "Fifty plus forty is ninety."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿Es un profesor?"
          }
        ],
        "choices": [
          "Sí, es una profesor.",
          "Sí, es un profesor.",
          "Sí, son un profesor."
        ],
        "answer": 1
      }
    ],
    "reads": [
      {
        "passage": "En la oficina hay una mesa y unas sillas. Hay noventa y nueve libros. Mara necesita treinta y cinco libros.",
        "question": "How many books does Mara need?",
        "choices": [
          "Ninety-nine",
          "Thirty-five",
          "Sixty"
        ],
        "answer": 1
      },
      {
        "passage": "Tomás trabaja en el almacén. Hay sesenta cuadernos y setenta libros. Rosa necesita un libro.",
        "question": "How many notebooks are there?",
        "choices": [
          "Sixty",
          "Seventy",
          "Thirty"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "the_spanish_alphabet_names_a", match: /The Spanish Alphabet Names A to M/i },
      { id: "the_spanish_alphabet_names_n", match: /The Spanish Alphabet Names N to Z/i },
      { id: "u_k_and_w_dieresis_and_forei", match: /Ü, K, and W: Dieresis and Foreign Letters/i },
      { id: "the_letter_x_mexico_examen_x", match: /The Letter X: México, Examen, Xilófono, Xochimilco/i },
    ],
    "unit": "Unit 3.4",
    "grade": "advanced",
    "goal": "I can say the Spanish alphabet, use ü, k and w, and pronounce the letter x in common words.",
    "phrases": [
      {
        "id": "g3u4_la_be_de_barcelona",
        "es": "La be de Barcelona.",
        "en": [
          "B as in Barcelona.",
          "B for Barcelona."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_spanish_alphabet_names_a"
      },
      {
        "id": "g3u4_la_ge_de_gato",
        "es": "La ge de gato.",
        "en": [
          "G as in gato.",
          "G for gato."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_spanish_alphabet_names_a"
      },
      {
        "id": "g3u4_la_hache_es_muda",
        "es": "La hache es muda.",
        "en": [
          "The h is silent.",
          "The letter h is silent."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_spanish_alphabet_names_a"
      },
      {
        "id": "g3u4_la_ene_de_espana",
        "es": "La eñe de España.",
        "en": [
          "Ñ as in España.",
          "The ñ in España."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "the_spanish_alphabet_names_n"
      },
      {
        "id": "g3u4_la_uve_doble_de_washington",
        "es": "La uve doble de Washington.",
        "en": [
          "W as in Washington.",
          "Double u as in Washington."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_spanish_alphabet_names_n"
      },
      {
        "id": "g3u4_deletreo_mi_nombre",
        "es": "Deletreo mi nombre.",
        "en": [
          "I spell my name.",
          "I'm spelling my name."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "the_spanish_alphabet_names_n"
      },
      {
        "id": "g3u4_como_se_escribe",
        "es": "¿Cómo se escribe?",
        "en": [
          "How is it spelled?",
          "How do you spell it?",
          "How is it written?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "the_spanish_alphabet_names_n"
      },
      {
        "id": "g3u4_el_pinguino",
        "es": "El pingüino.",
        "en": [
          "The penguin."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "u_k_and_w_dieresis_and_forei"
      },
      {
        "id": "g3u4_que_verguenza",
        "es": "¡Qué vergüenza!",
        "en": [
          "How embarrassing!",
          "What a shame!"
        ],
        "tier": 3,
        "skill": "es_greetings",
        "topic": "u_k_and_w_dieresis_and_forei"
      },
      {
        "id": "g3u4_el_kilo_de_manzanas",
        "es": "El kilo de manzanas.",
        "en": [
          "A kilo of apples.",
          "The kilo of apples."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "u_k_and_w_dieresis_and_forei"
      },
      {
        "id": "g3u4_el_kiwi_es_una_fruta",
        "es": "El kiwi es una fruta.",
        "en": [
          "The kiwi is a fruit.",
          "Kiwi is a fruit."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "u_k_and_w_dieresis_and_forei"
      },
      {
        "id": "g3u4_mexico_se_escribe_con_equis",
        "es": "México se escribe con equis.",
        "en": [
          "Mexico is spelled with an x.",
          "Mexico is written with an x."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_letter_x_mexico_examen_x"
      },
      {
        "id": "g3u4_la_equis_de_mexico_suena_com",
        "es": "La equis de México suena como jota.",
        "en": [
          "The x in México sounds like jota.",
          "The x in México sounds like the Spanish j."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_letter_x_mexico_examen_x"
      },
      {
        "id": "g3u4_el_examen_de_espanol",
        "es": "El examen de español.",
        "en": [
          "The Spanish exam.",
          "The Spanish test."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "the_letter_x_mexico_examen_x"
      },
      {
        "id": "g3u4_xochimilco_es_bonito",
        "es": "Xochimilco es bonito.",
        "en": [
          "Xochimilco is beautiful.",
          "Xochimilco is nice."
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "the_letter_x_mexico_examen_x"
      }
    ],
    "scene": {
      "title": "¿Cómo se escribe?",
      "art": "libro",
      "lines": [
        {
          "who": "diego",
          "es": "¿Cómo se escribe tu nombre?",
          "en": "How do you spell your name?",
          "art": "libro"
        },
        {
          "who": "mara",
          "es": "Eme, a, erre, a. Mara.",
          "en": "M, a, r, a. Mara."
        },
        {
          "who": "mara",
          "es": "¡Muy bien! ¿Y la equis?",
          "en": "Very good! And the x?"
        },
        {
          "who": "diego",
          "es": "México se escribe con equis.",
          "en": "Mexico is spelled with an x."
        },
        {
          "who": "mara",
          "es": "Y el examen de español también.",
          "en": "And the Spanish exam too."
        },
        {
          "who": "rosa",
          "es": "En México hay muchos taxis.",
          "en": "In Mexico there are many taxis."
        },
        {
          "who": "tomas",
          "es": "El pingüino tiene dos puntos: ü.",
          "en": "The penguin has two dots: ü."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "How does Mara spell her name?",
          "choices": [
            "Ene, a, erre, a",
            "Eme, a, erre, a",
            "Eme, a, ge, a"
          ],
          "answer": 1
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How is Mexico spelled, according to Diego?",
          "choices": [
            "With an x",
            "With a j",
            "With a g"
          ],
          "answer": 0
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What does Tomás say the penguin has?",
          "choices": [
            "A silent h",
            "Three letters",
            "Two dots"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "At your door: a courier reads your address and asks you to confirm each letter.",
      "learnerCard": "You are giving your address to a courier. Spell the street name and confirm each letter.",
      "learnerCardEs": "Tú das tu dirección al mensajero. Deletrea las letras.",
      "partnerCard": "Diego is a courier. He reads your address and asks you to confirm each letter.",
      "goals": [
        {
          "id": "spell",
          "text": "Spell the street name letter by letter (la be de Barcelona)."
        },
        {
          "id": "equis",
          "text": "Confirm the letter x when he asks (sí, es la equis)."
        },
        {
          "id": "city",
          "text": "Say where you live (vivo en México)."
        },
        {
          "id": "bye",
          "text": "Thank him and say goodbye (muchas gracias, adiós)."
        }
      ],
      "targets": [
        "La be de Barcelona.",
        "¿Cómo se escribe?",
        "Sí, es la equis.",
        "Vivo en México.",
        "Muchas gracias, adiós."
      ],
      "opening": "Buenas tardes. ¿Cómo se escribe su calle?",
      "script": [
        {
          "goal": "spell",
          "expect": [
            "be",
            "erre",
            "barcelona"
          ],
          "reply": "Be de Barcelona. Muy bien, ¿y la otra letra?",
          "hint": "Say \"La be de Barcelona.\""
        },
        {
          "goal": "equis",
          "expect": [
            "equis",
            "mexico"
          ],
          "reply": "La equis de México. Perfecto.",
          "hint": "Say \"Sí, es la equis de México.\""
        },
        {
          "goal": "city",
          "expect": [
            "vivo",
            "mexico"
          ],
          "reply": "¡México! Muy bien.",
          "hint": "Say \"Vivo en México.\""
        },
        {
          "goal": "bye",
          "expect": [
            "gracias",
            "adios"
          ],
          "reply": "¡De nada! Hasta luego.",
          "hint": "Say \"Muchas gracias, adiós.\""
        }
      ],
      "nudges": {
        "spell": "Di: la be de Barcelona.",
        "equis": "Di: sí, es la equis.",
        "city": "Di: vivo en México.",
        "bye": "Di: muchas gracias, adiós."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós! Buenas tardes.",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "La",
        "after": "de Barcelona.",
        "choices": [
          "be",
          "eme",
          "equis"
        ],
        "answer": 0,
        "en": "B as in Barcelona."
      },
      {
        "before": "El",
        "after": "nada en el agua.",
        "choices": [
          "kilo",
          "pingüino",
          "koala"
        ],
        "answer": 1,
        "en": "The penguin swims in the water."
      },
      {
        "before": "México se escribe con",
        "after": ".",
        "choices": [
          "equis",
          "jota",
          "hache"
        ],
        "answer": 0,
        "en": "Mexico is spelled with an x."
      },
      {
        "before": "Washington empieza con",
        "after": "doble.",
        "choices": [
          "uve",
          "equis",
          "ce"
        ],
        "answer": 0,
        "en": "Washington starts with a double u."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Cómo se escribe tu nombre?"
          }
        ],
        "choices": [
          "Son las tres.",
          "Se escribe con erre, o, ese y a.",
          "Tengo doce años."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Qué letra es la uve doble?"
          }
        ],
        "choices": [
          "Es la letra k.",
          "Es la letra x.",
          "Es la letra w."
        ],
        "answer": 2
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿El pingüino tiene diéresis?"
          }
        ],
        "choices": [
          "Sí, tiene dos puntos.",
          "No, es un examen.",
          "Sí, es un kilo."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara deletrea su nombre: eme, a, erre, a. Rosa escribe la equis de México. Mara dice: «¡Muy bien!»",
        "question": "What does Mara spell?",
        "choices": [
          "The word pingüino",
          "Her name",
          "Her address"
        ],
        "answer": 1
      },
      {
        "passage": "El pingüino tiene una diéresis: ü. La palabra «vergüenza» también tiene diéresis. En México, la equis suena como jota.",
        "question": "Which word has a diéresis?",
        "choices": [
          "Pingüino",
          "México",
          "Examen"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "spelling_alphabet_for_phones", match: /Spelling Alphabet for Phones: A de Antonio, B de Barcelona/i },
      { id: "nicknames_and_pet_forms_of_n", match: /Nicknames and Pet Forms of Names: Pepe, Paco, Lupita, Chuy/i },
      { id: "phone_numbers_addresses_and_", match: /Phone Numbers, Addresses, and Emails/i },
      { id: "spelling_numbers_in_words_ve", match: /Spelling Numbers in Words: Veintiuno, Dieciséis, Veintidós/i },
    ],
    "unit": "Unit 3.5",
    "grade": "advanced",
    "goal": "I can spell with the phone alphabet, use nicknames, give phone numbers, addresses and emails, and spell numbers.",
    "phrases": [
      {
        "id": "g3u5_a_de_antonio",
        "es": "A de Antonio.",
        "en": [
          "A as in Antonio.",
          "A for Antonio."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "spelling_alphabet_for_phones"
      },
      {
        "id": "g3u5_b_de_barcelona",
        "es": "B de Barcelona.",
        "en": [
          "B as in Barcelona.",
          "B for Barcelona."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "spelling_alphabet_for_phones"
      },
      {
        "id": "g3u5_c_de_casa",
        "es": "C de casa.",
        "en": [
          "C as in casa.",
          "C for casa."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "spelling_alphabet_for_phones"
      },
      {
        "id": "g3u5_como_se_escribe",
        "es": "¿Cómo se escribe?",
        "en": [
          "How do you spell it?",
          "How is it spelled?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "spelling_alphabet_for_phones"
      },
      {
        "id": "g3u5_pepe_es_jose",
        "es": "Pepe es José.",
        "en": [
          "Pepe is José."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "nicknames_and_pet_forms_of_n"
      },
      {
        "id": "g3u5_paco_es_francisco",
        "es": "Paco es Francisco.",
        "en": [
          "Paco is Francisco."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "nicknames_and_pet_forms_of_n"
      },
      {
        "id": "g3u5_lupita_es_guadalupe",
        "es": "Lupita es Guadalupe.",
        "en": [
          "Lupita is Guadalupe."
        ],
        "tier": 3,
        "skill": "es_ser_estar",
        "topic": "nicknames_and_pet_forms_of_n"
      },
      {
        "id": "g3u5_chuy_es_jesus",
        "es": "Chuy es Jesús.",
        "en": [
          "Chuy is Jesús."
        ],
        "tier": 3,
        "skill": "es_ser_estar",
        "topic": "nicknames_and_pet_forms_of_n"
      },
      {
        "id": "g3u5_mi_telefono_es",
        "es": "Mi teléfono es...",
        "en": [
          "My phone number is...",
          "My phone is..."
        ],
        "alt": [
          "Mi número de teléfono es..."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "phone_numbers_addresses_and_"
      },
      {
        "id": "g3u5_mi_correo_es",
        "es": "Mi correo es...",
        "en": [
          "My email is...",
          "My email address is..."
        ],
        "alt": [
          "Mi correo electrónico es..."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "phone_numbers_addresses_and_"
      },
      {
        "id": "g3u5_mi_direccion_es",
        "es": "Mi dirección es...",
        "en": [
          "My address is..."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "phone_numbers_addresses_and_"
      },
      {
        "id": "g3u5_arroba_punto_com",
        "es": "Arroba, punto com.",
        "en": [
          "At sign, dot com."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "phone_numbers_addresses_and_"
      },
      {
        "id": "g3u5_veintiuno",
        "es": "Veintiuno.",
        "en": [
          "Twenty-one.",
          "Twenty one."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "spelling_numbers_in_words_ve"
      },
      {
        "id": "g3u5_dieciseis",
        "es": "Dieciséis.",
        "en": [
          "Sixteen."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "spelling_numbers_in_words_ve"
      },
      {
        "id": "g3u5_veintidos",
        "es": "Veintidós.",
        "en": [
          "Twenty-two."
        ],
        "tier": 3,
        "skill": "es_numbers",
        "topic": "spelling_numbers_in_words_ve"
      },
      {
        "id": "g3u5_treinta_y_uno",
        "es": "Treinta y uno.",
        "en": [
          "Thirty-one."
        ],
        "tier": 3,
        "skill": "es_numbers",
        "topic": "spelling_numbers_in_words_ve"
      }
    ],
    "scene": {
      "title": "En el gimnasio",
      "art": "telefono",
      "lines": [
        {
          "who": "mara",
          "es": "Hola, bienvenido al gimnasio. ¿Cómo te llamas?",
          "en": "Hi, welcome to the gym. What's your name?",
          "art": "telefono"
        },
        {
          "who": "tomas",
          "es": "Soy Tomás. Mi teléfono es seis, dos, uno, cuatro.",
          "en": "I'm Tomás. My phone number is six, two, one, four."
        },
        {
          "who": "mara",
          "es": "¿Cómo se escribe tu apellido?",
          "en": "How do you spell your last name?"
        },
        {
          "who": "tomas",
          "es": "A de Antonio, R de Roma.",
          "en": "A as in Antonio, R as in Roma."
        },
        {
          "who": "mara",
          "es": "¿Y tu correo?",
          "en": "And your email?"
        },
        {
          "who": "tomas",
          "es": "Mi correo es tomas arroba correo punto com.",
          "en": "My email is tomas at correo dot com."
        },
        {
          "who": "mara",
          "es": "Gracias. ¿Y tu dirección?",
          "en": "Thanks. And your address?"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What is Tomás's phone number?",
          "choices": [
            "Six, two, one, four.",
            "Six, two, two, four.",
            "Seven, two, one, four."
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How does Tomás spell his last name?",
          "choices": [
            "A as in Antonio, R as in Roma.",
            "B as in Barcelona, C as in casa.",
            "A as in Antonio, R as in Rosa."
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "mara",
      "partnerName": "Mara",
      "setting": "The front desk of a gym. Mara signs you up as a new member.",
      "learnerCard": "You are registering at a gym. Give your name, your phone number, your email and your address clearly.",
      "learnerCardEs": "Te apuntas al gimnasio. Da tu nombre, tu teléfono, tu correo y tu dirección.",
      "partnerCard": "Mara works at the gym and writes down the information of every new member.",
      "goals": [
        {
          "id": "name",
          "text": "Give your first and last name (Soy...)."
        },
        {
          "id": "phone",
          "text": "Say your phone number digit by digit (Mi teléfono es...)."
        },
        {
          "id": "email",
          "text": "Give your email with arroba and punto com (Mi correo es...)."
        },
        {
          "id": "address",
          "text": "Give your address (Mi dirección es...)."
        }
      ],
      "targets": [
        "Soy...",
        "Mi teléfono es...",
        "Mi correo es...",
        "Mi dirección es...",
        "arroba",
        "punto com"
      ],
      "opening": "¡Hola! Bienvenido al gimnasio. ¿Cómo te llamas?",
      "script": [
        {
          "goal": "name",
          "expect": [
            "soy",
            "llamo",
            "nombre"
          ],
          "reply": "¡Mucho gusto! ¿Y tu teléfono?",
          "hint": "Say \"Soy Ana López.\""
        },
        {
          "goal": "phone",
          "expect": [
            "telefono",
            "numero",
            "es"
          ],
          "reply": "Perfecto. ¿Tienes correo?",
          "hint": "Say \"Mi teléfono es seis, dos, uno, cuatro.\""
        },
        {
          "goal": "email",
          "expect": [
            "correo",
            "arroba",
            "punto"
          ],
          "reply": "Muy bien. ¿Y tu dirección?",
          "hint": "Say \"Mi correo es ana arroba correo punto com.\""
        },
        {
          "goal": "address",
          "expect": [
            "direccion",
            "calle",
            "es"
          ],
          "reply": "¡Listo! Ya estás en el gimnasio.",
          "hint": "Say \"Mi dirección es calle Sol, veintidós.\""
        }
      ],
      "nudges": {
        "name": "Di tu nombre: «Soy…»",
        "phone": "Di tu teléfono: «Mi teléfono es…»",
        "email": "Di tu correo con arroba y punto com.",
        "address": "Di tu dirección: «Mi dirección es…»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Gracias! Nos vemos en el gimnasio. ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Mi ",
        "after": " es seis, dos, uno.",
        "choices": [
          "teléfono",
          "correo",
          "dirección"
        ],
        "answer": 0,
        "en": "My phone number is six, two, one."
      },
      {
        "before": "Pepe ",
        "after": " José.",
        "choices": [
          "es",
          "eres",
          "soy"
        ],
        "answer": 0,
        "en": "Pepe is José."
      },
      {
        "before": "Mi correo es ana ",
        "after": " correo punto com.",
        "choices": [
          "arroba",
          "punto",
          "de"
        ],
        "answer": 0,
        "en": "My email is ana at correo dot com."
      },
      {
        "before": "Treinta y ",
        "after": ".",
        "choices": [
          "uno",
          "un",
          "una"
        ],
        "answer": 0,
        "en": "Thirty-one."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿Cómo se escribe tu apellido?"
          }
        ],
        "choices": [
          "A de Antonio, R de Roma.",
          "Mi correo es ana arroba correo punto com.",
          "Soy de México."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Y tu correo?"
          }
        ],
        "choices": [
          "Mi correo es ana arroba correo punto com.",
          "Mi dirección es calle Sol.",
          "Veintidós."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Cómo te llamas?"
          }
        ],
        "choices": [
          "Soy Ana. Mi apellido es López.",
          "Es veintidós.",
          "A de Antonio."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Rosa trabaja en el gimnasio. Ella dice: «Mi teléfono es cinco, cinco, uno, dos. Mi correo es rosa arroba correo punto com.»",
        "question": "What is Rosa's email?",
        "choices": [
          "rosa at correo dot com",
          "rosa at correo dot es",
          "rosa at gimnasio dot com"
        ],
        "answer": 0
      },
      {
        "passage": "Tomás dice su apellido por teléfono: «A de Antonio, R de Roma.» Su apellido es Arévalo.",
        "question": "How does Tomás spell the first letter of his last name?",
        "choices": [
          "A as in Antonio.",
          "R as in Roma.",
          "C as in casa."
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "age_with_tener_tengo_anos", match: /Age with Tener: Tengo Años/i },
      { id: "tener_for_everyday_possessio", match: /Tener for Everyday Possession: Tengo, Tienes, Tiene in Conversation/i },
      { id: "height_weight_and_measuremen", match: /Height, Weight, and Measurements: Mide, Pesa, Cuesta/i },
      { id: "adjective_agreement_in_gende", match: /Adjective Agreement in Gender and Number/i },
    ],
    "unit": "Unit 3.6",
    "grade": "advanced",
    "goal": "I can give my age, say what I have, and describe people with adjectives that agree in gender and number.",
    "phrases": [
      {
        "id": "g3u6_tengo_veinticinco_anos",
        "es": "Tengo veinticinco años.",
        "en": [
          "I'm twenty-five years old.",
          "I am twenty-five years old.",
          "I'm twenty-five."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "age_with_tener_tengo_anos"
      },
      {
        "id": "g3u6_cuantos_anos_tienes",
        "es": "¿Cuántos años tienes?",
        "en": [
          "How old are you?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "age_with_tener_tengo_anos"
      },
      {
        "id": "g3u6_mi_hermana_tiene_doce_anos",
        "es": "Mi hermana tiene doce años.",
        "en": [
          "My sister is twelve years old.",
          "My sister is twelve."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "age_with_tener_tengo_anos"
      },
      {
        "id": "g3u6_tengo_dos_hermanos",
        "es": "Tengo dos hermanos.",
        "en": [
          "I have two brothers.",
          "I have two siblings."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "tener_for_everyday_possessio"
      },
      {
        "id": "g3u6_tienes_un_hermano",
        "es": "¿Tienes un hermano?",
        "en": [
          "Do you have a brother?",
          "Have you got a brother?"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "tener_for_everyday_possessio"
      },
      {
        "id": "g3u6_ella_tiene_una_casa_bonita",
        "es": "Ella tiene una casa bonita.",
        "en": [
          "She has a pretty house.",
          "She has a nice house."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "tener_for_everyday_possessio"
      },
      {
        "id": "g3u6_no_tiene_tiempo",
        "es": "No tiene tiempo.",
        "en": [
          "He doesn't have time.",
          "She doesn't have time."
        ],
        "alt": [
          "Él no tiene tiempo.",
          "Ella no tiene tiempo."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "tener_for_everyday_possessio"
      },
      {
        "id": "g3u6_tienes_un_coche",
        "es": "¿Tienes un coche?",
        "en": [
          "Do you have a car?",
          "Have you got a car?"
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "tener_for_everyday_possessio"
      },
      {
        "id": "g3u6_mide_dos_metros",
        "es": "Mide dos metros.",
        "en": [
          "He is two meters tall.",
          "She is two meters tall."
        ],
        "alt": [
          "Él mide dos metros.",
          "Ella mide dos metros."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "height_weight_and_measuremen"
      },
      {
        "id": "g3u6_pesa_cinco_kilos",
        "es": "Pesa cinco kilos.",
        "en": [
          "It weighs five kilos.",
          "It weighs five kilograms."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "height_weight_and_measuremen"
      },
      {
        "id": "g3u6_tiene_tres_metros_de_largo",
        "es": "Tiene tres metros de largo.",
        "en": [
          "It is three meters long."
        ],
        "tier": 3,
        "skill": "es_present_erir",
        "topic": "height_weight_and_measuremen"
      },
      {
        "id": "g3u6_una_casa_grande",
        "es": "una casa grande",
        "en": [
          "a big house",
          "a large house"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "adjective_agreement_in_gende"
      },
      {
        "id": "g3u6_unos_amigos_simpaticos",
        "es": "unos amigos simpáticos",
        "en": [
          "some nice friends",
          "some friendly friends"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjective_agreement_in_gende"
      },
      {
        "id": "g3u6_muchos_libros",
        "es": "muchos libros",
        "en": [
          "many books",
          "a lot of books"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "adjective_agreement_in_gende"
      },
      {
        "id": "g3u6_mis_amigos_son_simpaticos",
        "es": "Mis amigos son simpáticos.",
        "en": [
          "My friends are nice.",
          "My friends are friendly."
        ],
        "alt": [
          "Mis amigas son simpáticas."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "adjective_agreement_in_gende"
      },
      {
        "id": "g3u6_la_casa_es_bonita",
        "es": "La casa es bonita.",
        "en": [
          "The house is pretty.",
          "The house is nice."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "adjective_agreement_in_gende"
      }
    ],
    "scene": {
      "title": "Fotos de familia",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Es domingo por la tarde. Los amigos están en un café.",
          "en": "It's Sunday afternoon. The friends are at a café.",
          "art": "cafe"
        },
        {
          "who": "rosa",
          "es": "¡Mira! Esta es mi familia. Tengo dos hermanos.",
          "en": "Look! This is my family. I have two brothers."
        },
        {
          "who": "diego",
          "es": "¿Cuántos años tiene tu hermano?",
          "en": "How old is your brother?"
        },
        {
          "who": "rosa",
          "es": "Mi hermano mayor tiene veinticinco años.",
          "en": "My older brother is twenty-five years old."
        },
        {
          "who": "tomas",
          "es": "Yo tengo una hermana. Ella tiene una casa bonita.",
          "en": "I have a sister. She has a pretty house."
        },
        {
          "who": "mara",
          "es": "Mi hermana mide un metro y medio.",
          "en": "My sister is one and a half meters tall."
        },
        {
          "who": "diego",
          "es": "Mis primos son simpáticos también.",
          "en": "My cousins are nice too."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "How many brothers does Rosa have?",
          "choices": [
            "One",
            "Two",
            "Three"
          ],
          "answer": 1
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How old is Rosa's older brother?",
          "choices": [
            "Twelve",
            "Thirty",
            "Twenty-five"
          ],
          "answer": 2
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "How tall is Mara's sister?",
          "choices": [
            "Half a meter",
            "Two meters",
            "One and a half meters"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "You and Rosa are pen pals. She sends you a photo of her family and asks about yours.",
      "learnerCard": "You are Rosa's pen pal. Tell her how old you are, what you have, one measurement, and describe your family with an adjective.",
      "learnerCardEs": "Eres el amigo o la amiga por carta de Rosa. Di tu edad, qué tienes, una medida y cómo es tu familia.",
      "partnerCard": "Rosa lives in Mexico City. She has two brothers and loves hearing about your family.",
      "goals": [
        {
          "id": "age",
          "text": "Say how old you are (Tengo … años)."
        },
        {
          "id": "have",
          "text": "Say what you have — brothers, sisters or a pet (Tengo …)."
        },
        {
          "id": "measure",
          "text": "Give a size or measurement (Mide … / Pesa …)."
        },
        {
          "id": "describe",
          "text": "Describe your family with an adjective (Mis … son …)."
        }
      ],
      "targets": [
        "Tengo quince años.",
        "¿Cuántos años tienes?",
        "Tengo dos hermanos.",
        "Mi perro mide un metro.",
        "Mis primos son simpáticos."
      ],
      "opening": "¡Hola! Soy Rosa, tu amiga por carta. ¿Cuántos años tienes?",
      "script": [
        {
          "goal": "age",
          "expect": [
            "tengo",
            "anos"
          ],
          "reply": "¡Qué bien! Yo tengo catorce años.",
          "hint": "Say \"Tengo quince años.\""
        },
        {
          "goal": "have",
          "expect": [
            "tengo",
            "hermano",
            "hermana",
            "perro",
            "gato"
          ],
          "reply": "¡Interesante! Yo tengo dos hermanos.",
          "hint": "Say \"Tengo dos hermanos.\""
        },
        {
          "goal": "measure",
          "expect": [
            "mide",
            "pesa",
            "metro",
            "kilo"
          ],
          "reply": "¡Un perro grande! Mi gato pesa cuatro kilos.",
          "hint": "Say \"Mi perro mide un metro.\""
        },
        {
          "goal": "describe",
          "expect": [
            "mis",
            "son",
            "simpatic"
          ],
          "reply": "¡Qué bien! Mis amigos son simpáticos también.",
          "hint": "Say \"Mis primos son simpáticos.\""
        }
      ],
      "nudges": {
        "age": "Di: «Tengo … años.»",
        "have": "Di: «Tengo … .»",
        "measure": "Di: «Mide … metros.»",
        "describe": "Di: «Mis … son simpáticos.»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Muchas gracias! Escríbeme pronto. ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Tengo veinticinco",
        "after": ".",
        "choices": [
          "año",
          "años",
          "añas"
        ],
        "answer": 1,
        "en": "I'm twenty-five years old."
      },
      {
        "before": "Mis amigos",
        "after": "simpáticos.",
        "choices": [
          "es",
          "eres",
          "son"
        ],
        "answer": 2,
        "en": "My friends are nice."
      },
      {
        "before": "Ella",
        "after": "una casa bonita.",
        "choices": [
          "tiene",
          "tengo",
          "tienes"
        ],
        "answer": 0,
        "en": "She has a pretty house."
      },
      {
        "before": "El perro",
        "after": "cinco kilos.",
        "choices": [
          "pesa",
          "tiene",
          "come"
        ],
        "answer": 0,
        "en": "The dog weighs five kilos."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Cuántos años tienes?"
          }
        ],
        "choices": [
          "Tengo catorce años.",
          "Tienes catorce años.",
          "Tiene catorce años."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Hola, soy Diego. Tengo trece años. Tengo dos hermanos y una hermana. Mi hermana tiene veinte años.",
        "question": "How old is Diego's sister?",
        "choices": [
          "Thirteen",
          "Twenty",
          "Two"
        ],
        "answer": 1
      },
      {
        "passage": "La casa de Rosa es grande y bonita. Su perro mide un metro y pesa diez kilos. Sus amigos son simpáticos.",
        "question": "What is true about Rosa's dog?",
        "choices": [
          "It weighs ten kilos.",
          "It is two meters tall.",
          "It has many books."
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "adjectives_ending_in_e_or_a_", match: /Adjectives Ending in -e or a Consonant/i },
      { id: "countries_and_nationalities", match: /Countries and Nationalities/i },
      { id: "languages_and_demonyms_espan", match: /Languages and Demonyms: Español, Inglés, Madrileño, Porteño, Boricua/i },
      { id: "jobs_and_professions", match: /Jobs and Professions/i },
    ],
    "unit": "Unit 3.7",
    "grade": "advanced",
    "goal": "I can say where people are from and what they do, using nationalities, jobs, and adjectives in -e or consonants.",
    "phrases": [
      {
        "id": "g3u7_soy_estadounidense",
        "es": "Soy estadounidense.",
        "en": [
          "I'm American.",
          "I am American.",
          "I'm from the United States."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "countries_and_nationalities"
      },
      {
        "id": "g3u7_es_colombiana",
        "es": "Es colombiana.",
        "en": [
          "She's Colombian.",
          "She is Colombian."
        ],
        "alt": [
          "Ella es colombiana."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "countries_and_nationalities"
      },
      {
        "id": "g3u7_ella_es_mexicana",
        "es": "Ella es mexicana.",
        "en": [
          "She's Mexican.",
          "She is Mexican."
        ],
        "alt": [
          "Es mexicana."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "countries_and_nationalities"
      },
      {
        "id": "g3u7_de_donde_eres",
        "es": "¿De dónde eres?",
        "en": [
          "Where are you from?",
          "Where do you come from?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "countries_and_nationalities"
      },
      {
        "id": "g3u7_ella_es_inteligente",
        "es": "Ella es inteligente.",
        "en": [
          "She's intelligent.",
          "She is intelligent.",
          "She's smart."
        ],
        "alt": [
          "Es inteligente."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "adjectives_ending_in_e_or_a_"
      },
      {
        "id": "g3u7_mi_amigo_es_joven",
        "es": "Mi amigo es joven.",
        "en": [
          "My friend is young."
        ],
        "alt": [
          "Mi amiga es joven."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjectives_ending_in_e_or_a_"
      },
      {
        "id": "g3u7_el_examen_es_facil",
        "es": "El examen es fácil.",
        "en": [
          "The exam is easy.",
          "The test is easy."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjectives_ending_in_e_or_a_"
      },
      {
        "id": "g3u7_los_estudiantes_son_intelige",
        "es": "Los estudiantes son inteligentes.",
        "en": [
          "The students are intelligent.",
          "The students are smart."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjectives_ending_in_e_or_a_"
      },
      {
        "id": "g3u7_hablo_ingles_y_espanol",
        "es": "Hablo inglés y español.",
        "en": [
          "I speak English and Spanish.",
          "I speak Spanish and English."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "languages_and_demonyms_espan"
      },
      {
        "id": "g3u7_ella_es_portena_de_buenos_ai",
        "es": "Ella es porteña de Buenos Aires.",
        "en": [
          "She's a porteña from Buenos Aires.",
          "She's from Buenos Aires."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "languages_and_demonyms_espan"
      },
      {
        "id": "g3u7_mi_amiga_es_boricua",
        "es": "Mi amiga es boricua.",
        "en": [
          "My friend is Puerto Rican.",
          "My friend is boricua."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "languages_and_demonyms_espan"
      },
      {
        "id": "g3u7_es_madrileno",
        "es": "Es madrileño.",
        "en": [
          "He's from Madrid.",
          "He is from Madrid."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "languages_and_demonyms_espan"
      },
      {
        "id": "g3u7_mi_hermano_es_ingeniero",
        "es": "Mi hermano es ingeniero.",
        "en": [
          "My brother is an engineer."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "jobs_and_professions"
      },
      {
        "id": "g3u7_es_profesora",
        "es": "Es profesora.",
        "en": [
          "She's a teacher.",
          "She is a teacher."
        ],
        "alt": [
          "Ella es profesora."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "jobs_and_professions"
      },
      {
        "id": "g3u7_soy_medico",
        "es": "Soy médico.",
        "en": [
          "I'm a doctor.",
          "I am a doctor."
        ],
        "alt": [
          "Soy médica."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "jobs_and_professions"
      },
      {
        "id": "g3u7_mi_padre_es_cocinero",
        "es": "Mi padre es cocinero.",
        "en": [
          "My father is a cook."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "jobs_and_professions"
      }
    ],
    "scene": {
      "title": "La cena internacional",
      "art": "mesa",
      "lines": [
        {
          "who": "narrator",
          "es": "Es la noche de la cena internacional.",
          "en": "It's the night of the international dinner.",
          "art": "mesa"
        },
        {
          "who": "rosa",
          "es": "¡Hola! Soy Rosa. Soy colombiana.",
          "en": "Hi! I'm Rosa. I'm Colombian."
        },
        {
          "who": "tomas",
          "es": "Mucho gusto, Rosa. ¿De dónde eres?",
          "en": "Nice to meet you, Rosa. Where are you from?"
        },
        {
          "who": "diego",
          "es": "Soy estadounidense. Mi hermano es ingeniero.",
          "en": "I'm American. My brother is an engineer."
        },
        {
          "who": "mara",
          "es": "Yo hablo inglés y español. ¿Y tú?",
          "en": "I speak English and Spanish. And you?"
        },
        {
          "who": "rosa",
          "es": "Ella es Mara. Es profesora y es inteligente.",
          "en": "She's Mara. She's a teacher, and she's smart."
        },
        {
          "who": "diego",
          "es": "Una mesa para cinco, por favor.",
          "en": "A table for five, please."
        },
        {
          "who": "rosa",
          "es": "¡Perfecto! Bienvenidos a la cena.",
          "en": "Perfect! Welcome to the dinner."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "Where is Rosa from?",
          "choices": [
            "Colombia",
            "Mexico",
            "The United States"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What is Diego's brother's job?",
          "choices": [
            "He's a cook.",
            "He's an engineer.",
            "He's a teacher."
          ],
          "answer": 1
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "What is Mara's job?",
          "choices": [
            "She's a doctor.",
            "She's an engineer.",
            "She's a teacher."
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "At an international dinner, guests are arriving and looking for their seats.",
      "learnerCard": "You are at an international dinner. Rosa knows the guests' countries and jobs; you know where everyone sits.",
      "learnerCardEs": "Estás en una cena internacional. Rosa sabe los países y los trabajos. Tú sabes dónde están las mesas.",
      "partnerCard": "Rosa is Colombian. She knows where the guests are from and what they do.",
      "goals": [
        {
          "id": "origen",
          "text": "Ask Rosa where she is from (¿De dónde eres?)"
        },
        {
          "id": "nacionalidad",
          "text": "Say you are American (Soy estadounidense.)"
        },
        {
          "id": "trabajo",
          "text": "Say that Mara is a teacher (Ella es profesora.)"
        },
        {
          "id": "mesa",
          "text": "Ask for a table for four (Una mesa para cuatro, por favor.)"
        }
      ],
      "targets": [
        "¿De dónde eres?",
        "Soy estadounidense.",
        "Ella es profesora.",
        "Es inteligente.",
        "Una mesa para cuatro, por favor."
      ],
      "opening": "¡Hola! Bienvenido a la cena internacional. Yo soy Rosa.",
      "script": [
        {
          "goal": "origen",
          "expect": [
            "de donde",
            "donde eres",
            "eres"
          ],
          "reply": "Soy colombiana. ¿Y tú?",
          "hint": "Say \"¿De dónde eres?\""
        },
        {
          "goal": "nacionalidad",
          "expect": [
            "soy",
            "estadounidense"
          ],
          "reply": "¡Qué bien! Yo hablo español y un poco de inglés.",
          "hint": "Say \"Soy estadounidense.\""
        },
        {
          "goal": "trabajo",
          "expect": [
            "es",
            "profesora",
            "ella"
          ],
          "reply": "Sí, ella es profesora. Es muy inteligente.",
          "hint": "Say \"Ella es profesora.\""
        },
        {
          "goal": "mesa",
          "expect": [
            "mesa",
            "cuatro",
            "por favor"
          ],
          "reply": "¡Perfecto! Aquí hay una mesa para cuatro.",
          "hint": "Say \"Una mesa para cuatro, por favor.\""
        }
      ],
      "nudges": {
        "origen": "Pregunta: ¿De dónde eres?",
        "nacionalidad": "Di: Soy estadounidense.",
        "trabajo": "Di: Ella es profesora.",
        "mesa": "Pide: Una mesa para cuatro, por favor."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Perfecto! ¡Buenas noches y buen provecho!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Soy ",
        "after": ".",
        "choices": [
          "estadounidense",
          "estadounidenses",
          "estadounidensas"
        ],
        "answer": 0,
        "en": "I'm American."
      },
      {
        "before": "El examen es ",
        "after": ".",
        "choices": [
          "fácil",
          "fáciles",
          "fácila"
        ],
        "answer": 0,
        "en": "The exam is easy."
      },
      {
        "before": "Ella es ",
        "after": " de Buenos Aires.",
        "choices": [
          "porteño",
          "porteñas",
          "porteña"
        ],
        "answer": 2,
        "en": "She's from Buenos Aires."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¡Hola! ¿De dónde eres?"
          }
        ],
        "choices": [
          "Eres estadounidense.",
          "Soy estadounidense.",
          "Son estadounidenses."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "Mara es profesora, ¿verdad?"
          }
        ],
        "choices": [
          "Sí, es muy inteligente.",
          "Sí, son muy inteligentes.",
          "Sí, soy muy inteligente."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Hablas español?"
          }
        ],
        "choices": [
          "Sí, es inglés y español.",
          "Sí, hablas inglés y español.",
          "Sí, hablo inglés y español."
        ],
        "answer": 2
      }
    ],
    "reads": [
      {
        "passage": "Rosa es colombiana. Habla español y un poco de inglés. Su hermano es ingeniero.",
        "question": "What does Rosa's brother do?",
        "choices": [
          "He's an engineer.",
          "He's a teacher.",
          "He's a cook."
        ],
        "answer": 0
      },
      {
        "passage": "Diego es estadounidense. Su amiga Mara es profesora. Mara es una persona muy inteligente.",
        "question": "Which is true about Mara?",
        "choices": [
          "She is Colombian.",
          "She is a teacher and very smart.",
          "She is from Buenos Aires."
        ],
        "answer": 1
      }
    ]
  },
  {
    topics: [
      { id: "family_members_and_relatives", match: /Family Members and Relatives/i },
      { id: "extended_family_marital_stat", match: /Extended Family, Marital Status, and Pets/i },
      { id: "possessive_adjectives_mi_tu_", match: /Possessive Adjectives: Mi, Tu, Su/i },
      { id: "possession_with_de", match: /Possession with De/i },
    ],
    "unit": "Unit 3.8",
    "grade": "advanced",
    "goal": "I can name family members, talk about marital status and pets, and use mi, tu, su and de to show possession.",
    "phrases": [
      {
        "id": "g3u8_mi_hermano",
        "es": "Mi hermano",
        "en": [
          "My brother"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "family_members_and_relatives"
      },
      {
        "id": "g3u8_mi_madre",
        "es": "Mi madre",
        "en": [
          "My mother",
          "My mom"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "family_members_and_relatives"
      },
      {
        "id": "g3u8_mi_padre",
        "es": "Mi padre",
        "en": [
          "My father",
          "My dad"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "family_members_and_relatives"
      },
      {
        "id": "g3u8_mi_abuela",
        "es": "Mi abuela",
        "en": [
          "My grandmother",
          "My grandma"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "family_members_and_relatives"
      },
      {
        "id": "g3u8_tengo_dos_primos",
        "es": "Tengo dos primos",
        "en": [
          "I have two cousins"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "family_members_and_relatives"
      },
      {
        "id": "g3u8_estoy_casado",
        "es": "Estoy casado.",
        "en": [
          "I'm married",
          "I am married"
        ],
        "alt": [
          "Estoy casada."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "extended_family_marital_stat"
      },
      {
        "id": "g3u8_mi_suegra",
        "es": "Mi suegra",
        "en": [
          "My mother-in-law"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "extended_family_marital_stat"
      },
      {
        "id": "g3u8_mi_perro",
        "es": "Mi perro",
        "en": [
          "My dog"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "extended_family_marital_stat"
      },
      {
        "id": "g3u8_soy_soltero",
        "es": "Soy soltero.",
        "en": [
          "I'm single",
          "I am single"
        ],
        "alt": [
          "Soy soltera."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "extended_family_marital_stat"
      },
      {
        "id": "g3u8_su_esposa",
        "es": "Su esposa",
        "en": [
          "His wife",
          "Her wife",
          "Your wife",
          "Their wife"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "possessive_adjectives_mi_tu_"
      },
      {
        "id": "g3u8_mis_padres",
        "es": "Mis padres",
        "en": [
          "My parents"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "possessive_adjectives_mi_tu_"
      },
      {
        "id": "g3u8_tu_hermana",
        "es": "Tu hermana",
        "en": [
          "Your sister"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "possessive_adjectives_mi_tu_"
      },
      {
        "id": "g3u8_nuestros_hijos",
        "es": "Nuestros hijos",
        "en": [
          "Our children",
          "Our kids"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "possessive_adjectives_mi_tu_"
      },
      {
        "id": "g3u8_el_perro_de_ana",
        "es": "El perro de Ana",
        "en": [
          "Ana's dog",
          "The dog of Ana"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "possession_with_de"
      },
      {
        "id": "g3u8_de_quien_es_el_libro",
        "es": "¿De quién es el libro?",
        "en": [
          "Whose book is it?",
          "Whose is the book?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "possession_with_de"
      },
      {
        "id": "g3u8_es_el_libro_de_ana",
        "es": "Es el libro de Ana.",
        "en": [
          "It's Ana's book.",
          "It is Ana's book."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "possession_with_de"
      }
    ],
    "scene": {
      "title": "Fotos de familia",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Mara y Tomás miran fotos de familia en el café.",
          "en": "Mara and Tomás look at family photos in the café.",
          "art": "cafe"
        },
        {
          "who": "mara",
          "es": "Este es mi hermano y esta es mi madre.",
          "en": "This is my brother and this is my mother."
        },
        {
          "who": "Tomás",
          "es": "¿Está casada tu hermana?",
          "en": "Is your sister married?"
        },
        {
          "who": "mara",
          "es": "No, mi hermana es soltera. Yo también soy soltera.",
          "en": "No, my sister is single. I'm single too."
        },
        {
          "who": "tomas",
          "es": "Yo estoy casado. Mi esposa se llama Rosa.",
          "en": "I'm married. My wife's name is Rosa."
        },
        {
          "who": "mara",
          "es": "Aquí está Diego. Rosa es su esposa.",
          "en": "Here is Diego. Rosa is his wife."
        },
        {
          "who": "tomas",
          "es": "Tengo dos primos. Y este es el perro de Ana.",
          "en": "I have two cousins. And this is Ana's dog."
        },
        {
          "who": "mara",
          "es": "¡Qué bonita familia!",
          "en": "What a nice family!"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "Who is in the first photo?",
          "choices": [
            "Mara's brother and mother",
            "Tomás's sister and father",
            "Rosa's parents"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What is Mara's sister's marital status?",
          "choices": [
            "Single",
            "Married",
            "A widow"
          ],
          "answer": 0
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "Whose wife is Rosa?",
          "choices": [
            "Diego's",
            "Tomás's",
            "Mara's"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "mara",
      "partnerName": "Mara",
      "setting": "At a café, looking at family photos on a phone.",
      "learnerCard": "You are comparing family photos with a new friend. Talk about your own relatives and ask about hers.",
      "learnerCardEs": "Mira fotos de familia con una amiga nueva. Habla de tu familia.",
      "partnerCard": "Mara is friendly and shows you photos of her brother, sister and cousin.",
      "goals": [
        {
          "id": "family",
          "text": "Name one person in your photo (Mi hermano / Mi madre)."
        },
        {
          "id": "ask",
          "text": "Ask if the girl in her photo is her sister (¿Es tu hermana?)."
        },
        {
          "id": "status",
          "text": "Say that you are married (Estoy casado.)."
        },
        {
          "id": "pet",
          "text": "Mention your pet (Mi perro.)."
        }
      ],
      "targets": [
        "Mi hermano",
        "Tu hermana",
        "Estoy casado.",
        "Mi perro",
        "El perro de Ana",
        "Su esposa"
      ],
      "opening": "¡Hola! Mira, este es mi hermano.",
      "script": [
        {
          "goal": "family",
          "expect": [
            "mi",
            "hermano"
          ],
          "reply": "¡Qué guapo! Mi hermano también está en mi foto.",
          "hint": "Say \"Mi hermano.\""
        },
        {
          "goal": "ask",
          "expect": [
            "tu",
            "hermana"
          ],
          "reply": "No, no es mi hermana. Es mi prima.",
          "hint": "Say \"¿Es tu hermana?\""
        },
        {
          "goal": "status",
          "expect": [
            "estoy",
            "casado"
          ],
          "reply": "¡Qué bien! Yo soy soltera.",
          "hint": "Say \"Estoy casado.\""
        },
        {
          "goal": "pet",
          "expect": [
            "mi",
            "perro"
          ],
          "reply": "¡Un perro! Mi gato se llama Luna.",
          "hint": "Say \"Mi perro.\""
        }
      ],
      "nudges": {
        "family": "Di: «Mi hermano.»",
        "ask": "Pregunta: «¿Es tu hermana?»",
        "status": "Di: «Estoy casado.»",
        "pet": "Di: «Mi perro.»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós! ¡Nos vemos pronto!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "",
        "after": " padres son Ana y Luis.",
        "choices": [
          "Mis",
          "Mi",
          "Tu"
        ],
        "answer": 0,
        "en": "My parents are Ana and Luis."
      },
      {
        "before": "El libro es ",
        "after": " Ana.",
        "choices": [
          "de",
          "mi",
          "su"
        ],
        "answer": 0,
        "en": "The book is Ana's."
      },
      {
        "before": "Yo ",
        "after": " casado.",
        "choices": [
          "estoy",
          "soy",
          "tengo"
        ],
        "answer": 0,
        "en": "I am married."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "mara",
            "es": "Este es mi hermano."
          }
        ],
        "choices": [
          "¡Qué guapo! ¿Cómo se llama?",
          "Tengo dos primos.",
          "Adiós, hasta luego."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Tienes un perro?"
          }
        ],
        "choices": [
          "Sí, tengo un perro.",
          "Sí, soy soltero.",
          "Es el libro de Ana."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿De quién es este gato?"
          }
        ],
        "choices": [
          "Es el gato de Ana.",
          "Estoy casado.",
          "Mi suegra."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara tiene dos primos. Su prima Ana está casada. El perro de Ana se llama Sol.",
        "question": "Who is married?",
        "choices": [
          "Ana",
          "Mara",
          "Sol"
        ],
        "answer": 0
      },
      {
        "passage": "Tomás está casado. Su esposa es Rosa. Rosa tiene un gato y Tomás tiene un perro.",
        "question": "What pet does Tomás have?",
        "choices": [
          "A dog",
          "A cat",
          "A bird"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "describing_people_appearance", match: /Describing People: Appearance/i },
      { id: "describing_people_personalit", match: /Describing People: Personality/i },
      { id: "adjective_position_and_muy", match: /Adjective Position and Muy/i },
      { id: "opposites_common_adjective_a", match: /Opposites: Common Adjective Antonym Pairs/i },
    ],
    "unit": "Unit 3.9",
    "grade": "advanced",
    "goal": "I can describe people's appearance and personality, place adjectives correctly, and use opposites.",
    "phrases": [
      {
        "id": "g3u9_es_alto_y_delgado",
        "es": "Es alto y delgado.",
        "en": [
          "He's tall and slim.",
          "He is tall and thin.",
          "He's tall and skinny.",
          "She's tall and slim.",
          "She is tall and thin.",
          "She's tall and skinny."
        ],
        "alt": [
          "Es alta y delgada."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "describing_people_appearance"
      },
      {
        "id": "g3u9_tiene_ojos_azules",
        "es": "Tiene ojos azules.",
        "en": [
          "He has blue eyes.",
          "She has blue eyes."
        ],
        "alt": [
          "Tiene los ojos azules."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "describing_people_appearance"
      },
      {
        "id": "g3u9_mi_amiga_es_rubia",
        "es": "Mi amiga es rubia.",
        "en": [
          "My friend is blonde.",
          "My friend has blonde hair."
        ],
        "alt": [
          "Mi amigo es rubio."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "describing_people_appearance"
      },
      {
        "id": "g3u9_es_morena",
        "es": "Es morena.",
        "en": [
          "She has dark hair.",
          "She is dark-haired.",
          "She's a brunette.",
          "He has dark hair.",
          "He is dark-haired."
        ],
        "alt": [
          "Es moreno."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "describing_people_appearance"
      },
      {
        "id": "g3u9_es_simpatica",
        "es": "Es simpática.",
        "en": [
          "She's nice.",
          "She is friendly.",
          "She's likeable."
        ],
        "alt": [
          "Es simpático."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "describing_people_personalit"
      },
      {
        "id": "g3u9_es_muy_amable",
        "es": "Es muy amable.",
        "en": [
          "He's very kind.",
          "She's very kind.",
          "He is very nice."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "describing_people_personalit"
      },
      {
        "id": "g3u9_es_un_buen_amigo",
        "es": "Es un buen amigo.",
        "en": [
          "He's a good friend.",
          "He is a good friend.",
          "She's a good friend.",
          "She is a good friend."
        ],
        "alt": [
          "Es una buena amiga."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "describing_people_personalit"
      },
      {
        "id": "g3u9_es_muy_trabajador",
        "es": "Es muy trabajador.",
        "en": [
          "He's very hard-working.",
          "He is very hardworking.",
          "He works very hard.",
          "She's very hard-working.",
          "She is very hardworking.",
          "She works very hard."
        ],
        "alt": [
          "Es muy trabajadora."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "describing_people_personalit"
      },
      {
        "id": "g3u9_es_un_poco_callado",
        "es": "Es un poco callado.",
        "en": [
          "He's a bit quiet.",
          "He is a little quiet.",
          "She's a bit quiet.",
          "She is a little quiet."
        ],
        "alt": [
          "Es un poco callada."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "describing_people_personalit"
      },
      {
        "id": "g3u9_es_una_mujer_muy_alta",
        "es": "Es una mujer muy alta.",
        "en": [
          "She's a very tall woman.",
          "She is a very tall woman."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjective_position_and_muy"
      },
      {
        "id": "g3u9_es_un_nino_pequeno",
        "es": "Es un niño pequeño.",
        "en": [
          "He's a small boy.",
          "He is a small boy."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjective_position_and_muy"
      },
      {
        "id": "g3u9_es_un_hombre_muy_simpatico",
        "es": "Es un hombre muy simpático.",
        "en": [
          "He's a very nice man.",
          "He is a very friendly man."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "adjective_position_and_muy"
      },
      {
        "id": "g3u9_es_joven_no_es_viejo",
        "es": "Es joven, no es viejo.",
        "en": [
          "He's young, not old.",
          "He is young, he isn't old."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "opposites_common_adjective_a"
      },
      {
        "id": "g3u9_es_caro_no_es_barato",
        "es": "Es caro, no es barato.",
        "en": [
          "It's expensive, not cheap.",
          "It is expensive, it isn't cheap."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "opposites_common_adjective_a"
      },
      {
        "id": "g3u9_el_examen_es_facil_no_es_dif",
        "es": "El examen es fácil, no es difícil.",
        "en": [
          "The test is easy, not hard.",
          "The exam is easy, not difficult."
        ],
        "tier": 3,
        "skill": "es_ser_estar",
        "topic": "opposites_common_adjective_a"
      }
    ],
    "scene": {
      "title": "Una cita en el café",
      "art": "cafe",
      "lines": [
        {
          "who": "mara",
          "es": "Tomás, mi amiga Rosa busca una cita.",
          "en": "Tomás, my friend Rosa is looking for a date.",
          "art": "cafe"
        },
        {
          "who": "tomas",
          "es": "¿Cómo es Rosa?",
          "en": "What is Rosa like?"
        },
        {
          "who": "mara",
          "es": "Es simpática y muy amable. Es una mujer muy alta.",
          "en": "She's nice and very kind. She's a very tall woman."
        },
        {
          "who": "tomas",
          "es": "¿Y Diego? ¿Cómo es?",
          "en": "And Diego? What is he like?"
        },
        {
          "who": "mara",
          "es": "Es alto y delgado. Tiene ojos azules.",
          "en": "He's tall and slim. He has blue eyes."
        },
        {
          "who": "tomas",
          "es": "¿Es callado?",
          "en": "Is he quiet?"
        },
        {
          "who": "mara",
          "es": "Es un poco callado, pero es un buen amigo. ¡Es muy divertido!",
          "en": "He's a bit quiet, but he's a good friend. He's very fun!"
        },
        {
          "who": "tomas",
          "es": "Perfecto. Rosa y Diego van al parque a las seis.",
          "en": "Perfect. Rosa and Diego are going to the park at six."
        }
      ],
      "questions": [
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What is Rosa like?",
          "choices": [
            "Nice and very kind",
            "Quiet and serious",
            "Old and tall"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "What does Diego look like?",
          "choices": [
            "Tall and slim with blue eyes",
            "Short and dark-haired",
            "Young and blonde"
          ],
          "answer": 0
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What is Diego's personality like?",
          "choices": [
            "A bit quiet but a good, fun friend",
            "Very loud and unfriendly",
            "Hard-working and boring"
          ],
          "answer": 0
        }
      ]
    },
    "convo": null,
    "fills": [
      {
        "before": "Es alto",
        "after": "delgado.",
        "choices": [
          "y",
          "muy",
          "no"
        ],
        "answer": 0,
        "en": "He's tall and slim."
      },
      {
        "before": "Es una mujer muy",
        "after": ".",
        "choices": [
          "alto",
          "altas",
          "alta"
        ],
        "answer": 2,
        "en": "She's a very tall woman."
      },
      {
        "before": "Tiene",
        "after": "azules.",
        "choices": [
          "pelo",
          "ojos",
          "mesa"
        ],
        "answer": 1,
        "en": "He has blue eyes."
      },
      {
        "before": "El examen es",
        "after": ", no es difícil.",
        "choices": [
          "fácil",
          "caro",
          "viejo"
        ],
        "answer": 0,
        "en": "The test is easy, not hard."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Cómo es Rosa?"
          }
        ],
        "choices": [
          "Es muy simpática y alta.",
          "Es un café pequeño.",
          "Tengo ojos azules."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Es alto Diego?"
          }
        ],
        "choices": [
          "Sí, es alto y delgado.",
          "Sí, es una mujer alta.",
          "No, el café es caro."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Es viejo tu amigo?"
          }
        ],
        "choices": [
          "No, es joven.",
          "No, es caro.",
          "Sí, es muy fácil."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Diego es alto y delgado. Tiene ojos azules. Es un poco callado, pero es muy divertido.",
        "question": "What is Diego like?",
        "choices": [
          "Tall and slim with blue eyes",
          "Short and loud",
          "Old and serious"
        ],
        "answer": 0
      },
      {
        "passage": "Mi coche es viejo y pequeño. El coche nuevo es caro, no es barato.",
        "question": "What is the new car like?",
        "choices": [
          "Expensive",
          "Cheap",
          "Old"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "asking_questions_question_wo", match: /Asking Questions: Question Words and Word Order/i },
      { id: "negatives_tambien_and_tampoc", match: /Negatives, También, and Tampoco/i },
      { id: "diphthongs_and_hiatus", match: /Diphthongs and Hiatus/i },
      { id: "more_stress_and_accent_rules", match: /More Stress and Accent Rules/i },
    ],
    "unit": "Unit 3.10",
    "grade": "advanced",
    "goal": "I can ask questions with question words, answer with negatives and tampoco, and pronounce diphthongs and accents.",
    "phrases": [
      {
        "id": "g3u10_como",
        "es": "¿Cómo?",
        "en": [
          "How?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "asking_questions_question_wo"
      },
      {
        "id": "g3u10_cuantos_anos_tienes",
        "es": "¿Cuántos años tienes?",
        "en": [
          "How old are you?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "asking_questions_question_wo"
      },
      {
        "id": "g3u10_que_es_esto",
        "es": "¿Qué es esto?",
        "en": [
          "What is this?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "asking_questions_question_wo"
      },
      {
        "id": "g3u10_quien_es_ella",
        "es": "¿Quién es ella?",
        "en": [
          "Who is she?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "asking_questions_question_wo"
      },
      {
        "id": "g3u10_verdad",
        "es": "¿Verdad?",
        "en": [
          "Right?",
          "Isn't it?",
          "Isn't that true?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "asking_questions_question_wo"
      },
      {
        "id": "g3u10_no_tampoco",
        "es": "No, tampoco.",
        "en": [
          "No, me neither.",
          "No, neither."
        ],
        "alt": [
          "Tampoco."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "negatives_tambien_and_tampoc"
      },
      {
        "id": "g3u10_yo_tampoco",
        "es": "Yo tampoco.",
        "en": [
          "Me neither.",
          "Neither do I.",
          "I don't either."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "negatives_tambien_and_tampoc"
      },
      {
        "id": "g3u10_yo_tambien",
        "es": "Yo también.",
        "en": [
          "Me too.",
          "I do too.",
          "So do I."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "negatives_tambien_and_tampoc"
      },
      {
        "id": "g3u10_no_no_es_verdad",
        "es": "No, no es verdad.",
        "en": [
          "No, that's not true.",
          "No, it's not true.",
          "No, that is not true."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "negatives_tambien_and_tampoc"
      },
      {
        "id": "g3u10_bueno",
        "es": "Bueno.",
        "en": [
          "Good.",
          "Well.",
          "Okay."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "diphthongs_and_hiatus"
      },
      {
        "id": "g3u10_cuidado",
        "es": "Cuidado.",
        "en": [
          "Careful.",
          "Watch out."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "diphthongs_and_hiatus"
      },
      {
        "id": "g3u10_el_pais",
        "es": "El país.",
        "en": [
          "The country."
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "diphthongs_and_hiatus"
      },
      {
        "id": "g3u10_el_dia",
        "es": "El día.",
        "en": [
          "The day."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "diphthongs_and_hiatus"
      },
      {
        "id": "g3u10_el_telefono",
        "es": "El teléfono.",
        "en": [
          "The telephone.",
          "The phone."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "more_stress_and_accent_rules",
        "art": "telefono"
      },
      {
        "id": "g3u10_el_lapiz",
        "es": "El lápiz.",
        "en": [
          "The pencil."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "more_stress_and_accent_rules"
      },
      {
        "id": "g3u10_la_ciudad",
        "es": "La ciudad.",
        "en": [
          "The city."
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "more_stress_and_accent_rules"
      }
    ],
    "scene": {
      "title": "En la parada",
      "art": "casa",
      "lines": [
        {
          "who": "mara",
          "es": "¡Hola! ¿Qué es esto?",
          "en": "Hi! What is this?",
          "art": "casa"
        },
        {
          "who": "diego",
          "es": "Es un lápiz. Cuidado.",
          "en": "It's a pencil. Careful."
        },
        {
          "who": "tomas",
          "es": "¿Quién es ella?",
          "en": "Who is she?"
        },
        {
          "who": "rosa",
          "es": "Es mi amiga Mara. ¿Verdad, Mara?",
          "en": "She's my friend Mara. Right, Mara?"
        },
        {
          "who": "mara",
          "es": "Sí. ¿Cuántos años tienes, Rosa?",
          "en": "Yes. How old are you, Rosa?"
        },
        {
          "who": "rosa",
          "es": "No tengo quince años. Tengo catorce.",
          "en": "I'm not fifteen. I'm fourteen."
        },
        {
          "who": "diego",
          "es": "Yo también. Bueno, tengo catorce años.",
          "en": "Me too. Well, I'm fourteen."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Diego show?",
          "choices": [
            "A pencil",
            "A telephone",
            "A book"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "Who is Mara?",
          "choices": [
            "Rosa's friend",
            "Rosa's teacher",
            "Rosa's sister"
          ],
          "answer": 0
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "How old is Rosa?",
          "choices": [
            "Fifteen",
            "Fourteen",
            "Ten"
          ],
          "answer": 1
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "A bus stop in the city. You interview a stranger for a class project.",
      "learnerCard": "You are a student interviewer. Ask Diego questions with question words and react with también or tampoco.",
      "learnerCardEs": "Eres estudiante. Entrevistas a Diego en la parada.",
      "partnerCard": "Diego is a stranger at the bus stop. He answers some questions, but not all.",
      "goals": [
        {
          "id": "agree_negative",
          "text": "Agree with Diego: you don't have a phone either (Yo tampoco.)"
        },
        {
          "id": "ask_age",
          "text": "Ask Diego how old he is (¿Cuántos años tienes?)"
        },
        {
          "id": "ask_who",
          "text": "Ask who the girl with the book is (¿Quién es ella?)"
        },
        {
          "id": "confirm",
          "text": "Check that the girl is not his friend (No es tu amiga, ¿verdad?)"
        }
      ],
      "targets": [
        "Yo tampoco.",
        "¿Cuántos años tienes?",
        "¿Quién es ella?",
        "¿Verdad?",
        "No, no es verdad."
      ],
      "opening": "Hola. Soy Diego. No tengo teléfono.",
      "script": [
        {
          "goal": "agree_negative",
          "expect": [
            "tampoco"
          ],
          "reply": "Bueno. ¿Y tú?",
          "hint": "Say \"Yo tampoco.\""
        },
        {
          "goal": "ask_age",
          "expect": [
            "cuantos",
            "anos",
            "tienes"
          ],
          "reply": "Tengo quince años. ¿Y tú?",
          "hint": "Say \"¿Cuántos años tienes?\""
        },
        {
          "goal": "ask_who",
          "expect": [
            "quien",
            "ella"
          ],
          "reply": "No sé. No es mi amiga.",
          "hint": "Say \"¿Quién es ella?\""
        },
        {
          "goal": "confirm",
          "expect": [
            "verdad"
          ],
          "reply": "Sí, es verdad. No es mi amiga. ¡Adiós!",
          "hint": "Say \"No es tu amiga, ¿verdad?\""
        }
      ],
      "nudges": {
        "agree_negative": "Di: «Yo tampoco.»",
        "ask_age": "Di: «¿Cuántos años tienes?»",
        "ask_who": "Di: «¿Quién es ella?»",
        "confirm": "Di: «No es tu amiga, ¿verdad?»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós! ¡Buen día!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "No, no es",
        "after": ".",
        "choices": [
          "verdad",
          "tampoco",
          "también"
        ],
        "answer": 0,
        "en": "No, it's not true."
      },
      {
        "before": "¿",
        "after": " es esto?",
        "choices": [
          "Qué",
          "Quién",
          "Cuántos"
        ],
        "answer": 0,
        "en": "What is this?"
      },
      {
        "before": "Yo",
        "after": ".",
        "choices": [
          "tampoco",
          "también",
          "verdad"
        ],
        "answer": 0,
        "en": "Me neither."
      },
      {
        "before": "El",
        "after": " es bueno.",
        "choices": [
          "lápiz"
        ],
        "answer": 0,
        "en": "The pencil is good."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "tomas",
            "es": "No tengo teléfono."
          }
        ],
        "choices": [
          "Yo tampoco.",
          "Yo sí.",
          "No, no es verdad."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Cuántos años tienes?"
          }
        ],
        "choices": [
          "Tengo quince años.",
          "Es un lápiz."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Quién es ella?"
          }
        ],
        "choices": [
          "Es mi amiga.",
          "Bueno."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara es de la ciudad. Tiene quince años. No tiene teléfono.",
        "question": "How old is Mara?",
        "choices": [
          "Fifteen",
          "Fourteen",
          "Ten"
        ],
        "answer": 0
      },
      {
        "passage": "Diego ve un lápiz y dice: «¡Cuidado!» Tomás pregunta: «¿Qué es esto?» Diego dice: «Es un lápiz.»",
        "question": "What does Diego see?",
        "choices": [
          "A pencil",
          "A telephone",
          "A book"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "stress_traps_in_english_cogn", match: /Stress Traps in English Cognates/i },
      { id: "hispanic_naming_and_official", match: /Hispanic Naming and Official Forms/i },
      { id: "false_friends_set_one", match: /False Friends Set One/i },
      { id: "spelling_cognate_patterns_ph", match: /Spelling Cognate Patterns: Ph, Th, Ct, and Sp Words/i },
    ],
    "unit": "Unit 3.11",
    "grade": "advanced",
    "goal": "I can spot stress traps in cognates, read Hispanic names on forms, and avoid first-set false friends.",
    "phrases": [
      {
        "id": "g3u11_el_doctor",
        "es": "el doctor",
        "en": [
          "the doctor"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "stress_traps_in_english_cogn"
      },
      {
        "id": "g3u11_el_profesor",
        "es": "el profesor",
        "en": [
          "the teacher",
          "the professor"
        ],
        "alt": [
          "la profesora"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "stress_traps_in_english_cogn"
      },
      {
        "id": "g3u11_el_hospital",
        "es": "el hospital",
        "en": [
          "the hospital"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "stress_traps_in_english_cogn"
      },
      {
        "id": "g3u11_la_musica",
        "es": "la música",
        "en": [
          "music",
          "the music"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "stress_traps_in_english_cogn",
        "art": "musica"
      },
      {
        "id": "g3u11_el_apellido",
        "es": "el apellido",
        "en": [
          "the surname",
          "the last name"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "hispanic_naming_and_official"
      },
      {
        "id": "g3u11_el_nombre_completo",
        "es": "el nombre completo",
        "en": [
          "the full name"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "hispanic_naming_and_official"
      },
      {
        "id": "g3u11_la_fecha_de_nacimiento",
        "es": "la fecha de nacimiento",
        "en": [
          "the date of birth",
          "the birth date"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "hispanic_naming_and_official"
      },
      {
        "id": "g3u11_la_direccion",
        "es": "la dirección",
        "en": [
          "the address"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "hispanic_naming_and_official"
      },
      {
        "id": "g3u11_actualmente",
        "es": "Actualmente",
        "en": [
          "Currently",
          "At present",
          "Nowadays"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "false_friends_set_one"
      },
      {
        "id": "g3u11_asisto_a_la_escuela",
        "es": "Asisto a la escuela.",
        "en": [
          "I attend school.",
          "I go to school."
        ],
        "tier": 3,
        "skill": "es_present_erir",
        "topic": "false_friends_set_one"
      },
      {
        "id": "g3u11_realizo_la_tarea",
        "es": "Realizo la tarea.",
        "en": [
          "I do the homework.",
          "I complete the homework."
        ],
        "tier": 3,
        "skill": "es_present_ar",
        "topic": "false_friends_set_one"
      },
      {
        "id": "g3u11_mi_hermana_es_sensible",
        "es": "Mi hermana es sensible.",
        "en": [
          "My sister is sensitive."
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "false_friends_set_one"
      },
      {
        "id": "g3u11_la_fisica",
        "es": "la física",
        "en": [
          "physics"
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "spelling_cognate_patterns_ph"
      },
      {
        "id": "g3u11_el_teatro",
        "es": "el teatro",
        "en": [
          "the theater",
          "the theatre"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "spelling_cognate_patterns_ph"
      },
      {
        "id": "g3u11_el_estudiante",
        "es": "el estudiante",
        "en": [
          "the student"
        ],
        "alt": [
          "la estudiante"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "spelling_cognate_patterns_ph"
      },
      {
        "id": "g3u11_la_fotografia",
        "es": "la fotografía",
        "en": [
          "the photograph",
          "the photo"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "spelling_cognate_patterns_ph"
      }
    ],
    "scene": {
      "title": "El formulario de Tomás",
      "art": "mesa",
      "lines": [
        {
          "who": "narrator",
          "es": "Tomás llena un formulario en la oficina de la escuela.",
          "en": "Tomás fills out a form at the school office.",
          "art": "mesa"
        },
        {
          "who": "rosa",
          "es": "Buenos días. ¿Cuál es tu nombre completo?",
          "en": "Good morning. What is your full name?"
        },
        {
          "who": "tomas",
          "es": "Tomás Rivera.",
          "en": "Tomás Rivera."
        },
        {
          "who": "rosa",
          "es": "¿Y el apellido materno? En el formulario van dos apellidos.",
          "en": "And the maternal surname? Two surnames go on the form."
        },
        {
          "who": "tomas",
          "es": "Ah, sí. Mi apellido materno es Gómez.",
          "en": "Ah, yes. My maternal surname is Gómez."
        },
        {
          "who": "rosa",
          "es": "Muy bien. ¿Y la fecha de nacimiento?",
          "en": "Very good. And the date of birth?"
        },
        {
          "who": "Tomás",
          "es": "Nací el dos de mayo. Actualmente vivo en la calle Sol.",
          "en": "I was born on the second of May. Currently I live on Calle Sol."
        },
        {
          "who": "rosa",
          "es": "Perfecto. La fotografía ya está aquí.",
          "en": "Perfect. The photograph is already here."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Rosa ask for first?",
          "choices": [
            "His full name",
            "His address",
            "His photo"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How many surnames go on the form?",
          "choices": [
            "One",
            "Two",
            "Three"
          ],
          "answer": 1
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "Where does Tomás live now?",
          "choices": [
            "In the hospital",
            "On Calle Sol",
            "At the theater"
          ],
          "answer": 1
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "The school office. You are a new student and Rosa gives you a registration form.",
      "learnerCard": "You fill out a registration form. Answer Rosa's questions about your name, surname, date of birth and address.",
      "learnerCardEs": "Llenas un formulario. Rosa te hace preguntas.",
      "partnerCard": "Rosa is the school clerk. She knows the Hispanic naming rules: two apellidos go on every official form.",
      "goals": [
        {
          "id": "fullname",
          "text": "Say your full name (Me llamo...)"
        },
        {
          "id": "apellido",
          "text": "Say your surname (Mi apellido es...)"
        },
        {
          "id": "nacimiento",
          "text": "Give your date of birth (Mi fecha de nacimiento es...)"
        },
        {
          "id": "direccion",
          "text": "Say where you live now (Actualmente vivo en...)"
        }
      ],
      "targets": [
        "Me llamo Ana López.",
        "Mi apellido es López.",
        "Mi fecha de nacimiento es el dos de mayo.",
        "Actualmente vivo en la calle Sol.",
        "Muchas gracias."
      ],
      "opening": "¡Buenos días! ¿Cuál es tu nombre completo?",
      "script": [
        {
          "goal": "fullname",
          "expect": [
            "me llamo",
            "nombre",
            "soy"
          ],
          "reply": "Muy bien. ¿Y tus apellidos?",
          "hint": "Say \"Me llamo Ana López.\""
        },
        {
          "goal": "apellido",
          "expect": [
            "apellido",
            "es"
          ],
          "reply": "Perfecto. En el formulario van dos apellidos: el paterno y el materno.",
          "hint": "Say \"Mi apellido es López.\""
        },
        {
          "goal": "nacimiento",
          "expect": [
            "fecha",
            "nacimiento"
          ],
          "reply": "Gracias. ¿Y tu dirección?",
          "hint": "Say \"Mi fecha de nacimiento es el dos de mayo.\""
        },
        {
          "goal": "direccion",
          "expect": [
            "vivo",
            "actualmente",
            "en"
          ],
          "reply": "Muy bien. Todo está completo. ¡Bienvenida!",
          "hint": "Say \"Actualmente vivo en la calle Sol.\""
        }
      ],
      "nudges": {
        "fullname": "Di: «Me llamo…»",
        "apellido": "Di: «Mi apellido es…»",
        "nacimiento": "Di: «Mi fecha de nacimiento es…»",
        "direccion": "Di: «Actualmente vivo en…»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Gracias! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Mi",
        "after": "es López.",
        "choices": [
          "apellido",
          "fecha",
          "fotografía"
        ],
        "answer": 0,
        "en": "My surname is López."
      },
      {
        "before": "¿Cuál es tu nombre",
        "after": "?",
        "choices": [
          "completo",
          "actualmente",
          "sensible"
        ],
        "answer": 0,
        "en": "What is your full name?"
      },
      {
        "before": "La",
        "after": "de nacimiento es el dos de mayo.",
        "choices": [
          "fecha",
          "mesa",
          "teatro"
        ],
        "answer": 0,
        "en": "The date of birth is May second."
      },
      {
        "before": "Ella",
        "after": "a la escuela.",
        "choices": [
          "asiste",
          "asisto",
          "asistir"
        ],
        "answer": 0,
        "en": "She attends school."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Cuál es tu nombre completo?"
          }
        ],
        "choices": [
          "Me llamo Ana Gómez.",
          "Tengo doce años.",
          "Vivo en la calle Sol."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Y tu apellido?"
          }
        ],
        "choices": [
          "Mi apellido es Rivera.",
          "Actualmente vivo aquí.",
          "La fotografía es bonita."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿Dónde vives actualmente?"
          }
        ],
        "choices": [
          "Actualmente vivo en la calle Sol.",
          "Actualmente es el dos de mayo.",
          "Mi apellido es Sol."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Rosa trabaja en la oficina. Ella lee el formulario de Tomás. Su nombre completo es Tomás Rivera Gómez y su dirección es la calle Sol.",
        "question": "What is Tomás's full name?",
        "choices": [
          "Tomás Rivera Gómez",
          "Rosa Rivera",
          "Tomás Sol"
        ],
        "answer": 0
      },
      {
        "passage": "La profesora de física es la señora Gómez. Actualmente enseña en el teatro de la escuela. Su hija asiste a la escuela también.",
        "question": "Where does Señora Gómez teach now?",
        "choices": [
          "In the school's theater",
          "In the hospital",
          "In the office of Rosa"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "introducing_yourself_in_five", match: /Introducing Yourself in Five Sentences/i },
      { id: "meeting_someone_new", match: /Role-Play: Meeting Someone New/i },
      { id: "keeping_a_conversation_alive", match: /Keeping a Conversation Alive: Y Tú and Follow-Up Questions/i },
      { id: "talking_about_your_family", match: /Talking About Your Family/i },
      { id: "quick_fire_personal_question", match: /Speaking: Quick-Fire Personal Questions and Answers/i },
    ],
    "unit": "Unit 3.12",
    "grade": "advanced",
    "goal": "I can introduce myself in five sentences, meet someone new, keep talk going with y tú, and talk about my family.",
    "phrases": [
      {
        "id": "g3u12_me_llamo_ana",
        "es": "Me llamo Ana.",
        "en": [
          "My name is Ana.",
          "I'm called Ana."
        ],
        "alt": [
          "Yo me llamo Ana."
        ],
        "tier": 1,
        "skill": "es_greetings",
        "topic": "introducing_yourself_in_five"
      },
      {
        "id": "g3u12_soy_de_mexico",
        "es": "Soy de México.",
        "en": [
          "I'm from Mexico.",
          "I am from Mexico."
        ],
        "alt": [
          "Yo soy de México."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "introducing_yourself_in_five"
      },
      {
        "id": "g3u12_tengo_veinte_anos",
        "es": "Tengo veinte años.",
        "en": [
          "I'm twenty years old.",
          "I am twenty years old."
        ],
        "alt": [
          "Yo tengo veinte años."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "introducing_yourself_in_five"
      },
      {
        "id": "g3u12_como_te_llamas",
        "es": "¿Cómo te llamas?",
        "en": [
          "What's your name?",
          "What is your name?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "meeting_someone_new"
      },
      {
        "id": "g3u12_mucho_gusto",
        "es": "Mucho gusto.",
        "en": [
          "Nice to meet you.",
          "Pleased to meet you."
        ],
        "alt": [
          "Encantado.",
          "Encantada."
        ],
        "tier": 1,
        "skill": "es_greetings",
        "topic": "meeting_someone_new"
      },
      {
        "id": "g3u12_de_donde_eres",
        "es": "¿De dónde eres?",
        "en": [
          "Where are you from?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "meeting_someone_new"
      },
      {
        "id": "g3u12_y_tu",
        "es": "¿Y tú?",
        "en": [
          "And you?",
          "What about you?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "keeping_a_conversation_alive"
      },
      {
        "id": "g3u12_y_usted",
        "es": "¿Y usted?",
        "en": [
          "And you? (formal)",
          "What about you? (formal)"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "keeping_a_conversation_alive"
      },
      {
        "id": "g3u12_donde_exactamente",
        "es": "¿Dónde exactamente?",
        "en": [
          "Where exactly?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "keeping_a_conversation_alive"
      },
      {
        "id": "g3u12_tengo_dos_hermanos",
        "es": "Tengo dos hermanos.",
        "en": [
          "I have two brothers."
        ],
        "alt": [
          "Yo tengo dos hermanos."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "talking_about_your_family"
      },
      {
        "id": "g3u12_mi_hermana_se_llama_rosa",
        "es": "Mi hermana se llama Rosa.",
        "en": [
          "My sister's name is Rosa.",
          "My sister is called Rosa."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "talking_about_your_family"
      },
      {
        "id": "g3u12_mi_padre_es_profesor",
        "es": "Mi padre es profesor.",
        "en": [
          "My father is a teacher.",
          "My dad is a teacher."
        ],
        "alt": [
          "Mi papá es profesor.",
          "Mi padre es maestro."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "talking_about_your_family"
      },
      {
        "id": "g3u12_tienes_hijos",
        "es": "¿Tienes hijos?",
        "en": [
          "Do you have children?",
          "Do you have kids?"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "quick_fire_personal_question"
      },
      {
        "id": "g3u12_a_que_te_dedicas",
        "es": "¿A qué te dedicas?",
        "en": [
          "What do you do?",
          "What do you do for a living?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "quick_fire_personal_question"
      },
      {
        "id": "g3u12_soy_estudiante",
        "es": "Soy estudiante.",
        "en": [
          "I'm a student.",
          "I am a student."
        ],
        "alt": [
          "Yo soy estudiante."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "quick_fire_personal_question"
      }
    ],
    "scene": {
      "title": "En la fiesta",
      "art": "musica",
      "lines": [
        {
          "who": "narrator",
          "es": "Es una fiesta en casa de Rosa.",
          "en": "It's a party at Rosa's house.",
          "art": "musica"
        },
        {
          "who": "mara",
          "es": "Hola, me llamo Mara. ¿Y tú?",
          "en": "Hi, my name is Mara. And you?"
        },
        {
          "who": "tomas",
          "es": "Mucho gusto. Soy Tomás. Soy de Colombia.",
          "en": "Nice to meet you. I'm Tomás. I'm from Colombia."
        },
        {
          "who": "mara",
          "es": "¿Dónde exactamente?",
          "en": "Where exactly?"
        },
        {
          "who": "tomas",
          "es": "Soy de Bogotá. Tengo veinte años. ¿Y tú?",
          "en": "I'm from Bogotá. I'm twenty years old. And you?"
        },
        {
          "who": "mara",
          "es": "Tengo diecinueve años. Tengo dos hermanos. Mi hermana se llama Ana.",
          "en": "I'm nineteen years old. I have two brothers. My sister's name is Ana."
        },
        {
          "who": "rosa",
          "es": "¡Hola! ¿Tienes hermanos, Tomás?",
          "en": "Hi! Do you have siblings, Tomás?"
        },
        {
          "who": "tomas",
          "es": "No, no tengo hijos. Soy estudiante.",
          "en": "No, I don't have children. I'm a student."
        }
      ],
      "questions": [
        {
          "after": 3,
          "kind": "read_respond",
          "question": "Where is Tomás from?",
          "choices": [
            "Colombia",
            "Bogotá",
            "Mexico"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "How old is Tomás?",
          "choices": [
            "Nineteen",
            "Twenty",
            "Twenty-one"
          ],
          "answer": 1
        },
        {
          "after": 8,
          "kind": "read_respond",
          "question": "Does Tomás have siblings?",
          "choices": [
            "No, he doesn't.",
            "Yes, he has two.",
            "Yes, he has one."
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "At a party at Rosa's house.",
      "learnerCard": "You meet Rosa at a party. Introduce yourself, ask where she is from, keep the conversation going with ¿Y tú?, and talk about your family.",
      "learnerCardEs": "Conoces a Rosa en una fiesta. Preséntate, pregunta de dónde es y habla de tu familia.",
      "partnerCard": "Rosa is friendly and wants to know about you and your family.",
      "goals": [
        {
          "id": "g1",
          "text": "Greet Rosa and say your name (Me llamo...)."
        },
        {
          "id": "g2",
          "text": "Say where you are from and ask where she is from (Soy de... / ¿De dónde eres?)."
        },
        {
          "id": "g3",
          "text": "Keep the conversation going and ask her age (¿Y tú? / ¿Cuántos años tienes?)."
        },
        {
          "id": "g4",
          "text": "Talk about your family (Tengo dos hermanos. / Mi hermana se llama...)."
        }
      ],
      "targets": [
        "Me llamo...",
        "Soy de...",
        "¿De dónde eres?",
        "¿Y tú?",
        "Tengo dos hermanos.",
        "Mi hermana se llama Ana."
      ],
      "opening": "¡Hola! Soy Rosa. ¿Cómo te llamas?",
      "script": [
        {
          "goal": "g1",
          "expect": [
            "hola",
            "me",
            "llamo"
          ],
          "reply": "Mucho gusto. ¿De dónde eres?",
          "hint": "Say \"Hola, me llamo Ana.\""
        },
        {
          "goal": "g2",
          "expect": [
            "soy",
            "de",
            "donde",
            "eres"
          ],
          "reply": "Soy de Colombia. ¡Qué bien! ¿Cuántos años tienes?",
          "hint": "Say \"Soy de México. ¿De dónde eres?\""
        },
        {
          "goal": "g3",
          "expect": [
            "y",
            "tu",
            "cuantos",
            "tienes"
          ],
          "reply": "Tengo veinte años. ¿Y tú?",
          "hint": "Say \"¿Y tú? ¿Cuántos años tienes?\""
        },
        {
          "goal": "g4",
          "expect": [
            "tengo",
            "hermanos",
            "hermana",
            "llama"
          ],
          "reply": "¡Qué bien! Yo tengo una hermana. ¡Hasta luego!",
          "hint": "Say \"Tengo dos hermanos. Mi hermana se llama Ana.\""
        }
      ],
      "nudges": {
        "g1": "Di: «Me llamo Ana».",
        "g2": "Di: «Soy de México. ¿De dónde eres?».",
        "g3": "Pregunta: «¿Y tú? ¿Cuántos años tienes?».",
        "g4": "Di: «Tengo dos hermanos. Mi hermana se llama Ana»."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Mucho gusto! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Me",
        "after": "Ana.",
        "choices": [
          "llamo",
          "llamas",
          "llama"
        ],
        "answer": 0,
        "en": "My name is Ana."
      },
      {
        "before": "Soy",
        "after": "México.",
        "choices": [
          "de",
          "en",
          "a"
        ],
        "answer": 0,
        "en": "I'm from Mexico."
      },
      {
        "before": "Tengo veinte",
        "after": ".",
        "choices": [
          "años",
          "año",
          "días"
        ],
        "answer": 0,
        "en": "I'm twenty years old."
      },
      {
        "before": "Mi hermana se",
        "after": "Rosa.",
        "choices": [
          "llama",
          "llamo",
          "llamas"
        ],
        "answer": 0,
        "en": "My sister's name is Rosa."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "tomas",
            "es": "Hola, me llamo Tomás. ¿Y tú?"
          }
        ],
        "choices": [
          "Mucho gusto. Me llamo Ana.",
          "Soy de México. Tengo dos hermanos.",
          "¿A qué te dedicas?"
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿De dónde eres?"
          }
        ],
        "choices": [
          "Soy de México. ¿Y tú?",
          "Tengo veinte años.",
          "Mi hermana se llama Rosa."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Tienes hijos?"
          }
        ],
        "choices": [
          "No, no tengo hijos. Soy estudiante.",
          "Sí, tengo dos hermanos.",
          "Me llamo Diego."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Me llamo Mara. Soy de México. Tengo veinte años y soy estudiante.",
        "question": "Where is Mara from?",
        "choices": [
          "Mexico",
          "Colombia",
          "Spain"
        ],
        "answer": 0
      },
      {
        "passage": "Tomás tiene un hermano y una hermana. Su hermana se llama Rosa. Rosa es profesora.",
        "question": "What is Rosa's job?",
        "choices": [
          "Teacher",
          "Student",
          "Doctor"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "introductions_and_family_des", match: /Listening: Introductions and Family Descriptions/i },
      { id: "reading_a_short_personal_pro", match: /Reading a Short Personal Profile/i },
      { id: "an_about_me_paragraph", match: /Writing: An About Me Paragraph/i },
      { id: "the_hispanic_world_countries", match: /The Hispanic World: Countries and Capitals/i },
      { id: "famous_hispanic_figures", match: /Famous Hispanic Figures/i },
    ],
    "unit": "Unit 3.13",
    "grade": "advanced",
    "goal": "I can understand and write simple introductions that describe myself and my family.",
    "phrases": [
      {
        "id": "g3u13_me_llamo_sara",
        "es": "Me llamo Sara.",
        "en": [
          "My name is Sara.",
          "I'm called Sara.",
          "I am named Sara."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "introductions_and_family_des"
      },
      {
        "id": "g3u13_tengo_dos_hermanos",
        "es": "Tengo dos hermanos.",
        "en": [
          "I have two brothers.",
          "I have two siblings."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "introductions_and_family_des"
      },
      {
        "id": "g3u13_mi_madre_es_doctora",
        "es": "Mi madre es doctora.",
        "en": [
          "My mother is a doctor.",
          "My mom is a doctor."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "introductions_and_family_des"
      },
      {
        "id": "g3u13_soy_de_chicago",
        "es": "Soy de Chicago.",
        "en": [
          "I'm from Chicago.",
          "I am from Chicago."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "introductions_and_family_des"
      },
      {
        "id": "g3u13_vivo_en_mexico",
        "es": "Vivo en México.",
        "en": [
          "I live in Mexico."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "reading_a_short_personal_pro"
      },
      {
        "id": "g3u13_tengo_catorce_anos",
        "es": "Tengo catorce años.",
        "en": [
          "I'm fourteen years old.",
          "I am fourteen years old.",
          "I'm fourteen."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "reading_a_short_personal_pro"
      },
      {
        "id": "g3u13_mi_padre_trabaja_en_un_hotel",
        "es": "Mi padre trabaja en un hotel.",
        "en": [
          "My father works in a hotel.",
          "My dad works in a hotel."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "reading_a_short_personal_pro"
      },
      {
        "id": "g3u13_mi_hermana_se_llama_ana",
        "es": "Mi hermana se llama Ana.",
        "en": [
          "My sister's name is Ana.",
          "My sister is called Ana."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "an_about_me_paragraph"
      },
      {
        "id": "g3u13_soy_alto_y_simpatico",
        "es": "Soy alto y simpático.",
        "en": [
          "I'm tall and friendly.",
          "I am tall and nice."
        ],
        "alt": [
          "Soy alta y simpática."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "an_about_me_paragraph"
      },
      {
        "id": "g3u13_mi_familia_es_pequena",
        "es": "Mi familia es pequeña.",
        "en": [
          "My family is small."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "an_about_me_paragraph"
      },
      {
        "id": "g3u13_madrid_es_la_capital_de_espa",
        "es": "Madrid es la capital de España.",
        "en": [
          "Madrid is the capital of Spain."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "the_hispanic_world_countries"
      },
      {
        "id": "g3u13_bogota_es_la_capital_de_colo",
        "es": "Bogotá es la capital de Colombia.",
        "en": [
          "Bogotá is the capital of Colombia."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_hispanic_world_countries"
      },
      {
        "id": "g3u13_costa_rica_es_un_pais_pequen",
        "es": "Costa Rica es un país pequeño.",
        "en": [
          "Costa Rica is a small country."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "the_hispanic_world_countries"
      },
      {
        "id": "g3u13_shakira_es_colombiana",
        "es": "Shakira es colombiana.",
        "en": [
          "Shakira is Colombian."
        ],
        "alt": [
          "Shakira es de Colombia."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "famous_hispanic_figures"
      },
      {
        "id": "g3u13_rafael_nadal_es_un_tenista_e",
        "es": "Rafael Nadal es un tenista español.",
        "en": [
          "Rafael Nadal is a Spanish tennis player.",
          "Rafael Nadal is a tennis player from Spain."
        ],
        "tier": 3,
        "skill": "es_ser_estar",
        "topic": "famous_hispanic_figures"
      },
      {
        "id": "g3u13_ella_es_cantante",
        "es": "Ella es cantante.",
        "en": [
          "She is a singer."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "famous_hispanic_figures"
      }
    ],
    "scene": {
      "title": "El perfil de la familia",
      "art": "libro",
      "lines": [
        {
          "who": "mara",
          "es": "Me llamo Mara y soy de Chicago.",
          "en": "My name is Mara and I'm from Chicago.",
          "art": "libro"
        },
        {
          "who": "tomas",
          "es": "Yo soy Tomás. Vivo en México con mi familia.",
          "en": "I'm Tomás. I live in Mexico with my family."
        },
        {
          "who": "mara",
          "es": "Mi madre es doctora y mi padre trabaja en un hotel.",
          "en": "My mother is a doctor and my father works in a hotel."
        },
        {
          "who": "tomas",
          "es": "Tengo dos hermanos. Mi hermana se llama Ana.",
          "en": "I have two brothers. My sister's name is Ana."
        },
        {
          "who": "mara",
          "es": "Mi familia es pequeña.",
          "en": "My family is small."
        },
        {
          "who": "tomas",
          "es": "Mi madre es de Colombia y es una cantante.",
          "en": "My mother is from Colombia and she is a singer."
        },
        {
          "who": "mara",
          "es": "¡Bien! Escribimos el perfil ahora.",
          "en": "Great! We're writing the profile now."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "Where is Mara from?",
          "choices": [
            "Mexico",
            "Chicago",
            "Colombia"
          ],
          "answer": 1
        },
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What does Mara's mother do?",
          "choices": [
            "She works in a hotel.",
            "She is a doctor.",
            "She is a singer."
          ],
          "answer": 1
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How many siblings does Tomás have?",
          "choices": [
            "One",
            "Three",
            "Two"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "mara",
      "partnerName": "Mara",
      "setting": "A school exchange video call. You each have half of your host family's profile and share facts to complete it.",
      "learnerCard": "You have your host family's facts: the mother is a doctor, there are two brothers, and the family lives in Mexico.",
      "learnerCardEs": "Tú tienes la otra parte del perfil. Habla de tu nombre, tu ciudad, tus hermanos y el trabajo de tu madre.",
      "partnerCard": "Mara has the other half: the names, the city of the family, and the father's job.",
      "goals": [
        {
          "id": "g1",
          "text": "Greet Mara and say your name (Me llamo…)."
        },
        {
          "id": "g2",
          "text": "Say where you are from (Soy de…)."
        },
        {
          "id": "g3",
          "text": "Say how many brothers or sisters you have (Tengo dos hermanos.)."
        },
        {
          "id": "g4",
          "text": "Say what your mother's job is (Mi madre es doctora.)."
        }
      ],
      "targets": [
        "Me llamo…",
        "Soy de…",
        "Tengo dos hermanos.",
        "Mi madre es doctora.",
        "Vivo en México."
      ],
      "opening": "¡Hola! Yo soy Mara. ¿Cómo te llamas?",
      "script": [
        {
          "goal": "g1",
          "expect": [
            "llamo"
          ],
          "reply": "¡Mucho gusto! ¿De dónde eres?",
          "hint": "Say \"Me llamo Alex.\""
        },
        {
          "goal": "g2",
          "expect": [
            "soy",
            "de"
          ],
          "reply": "¡Qué bien! Yo soy de Chicago. ¿Tienes hermanos?",
          "hint": "Say \"Soy de Toronto.\""
        },
        {
          "goal": "g3",
          "expect": [
            "tengo",
            "hermanos"
          ],
          "reply": "¡Interesante! ¿Y tu madre? ¿Es doctora?",
          "hint": "Say \"Tengo dos hermanos.\""
        },
        {
          "goal": "g4",
          "expect": [
            "madre",
            "doctora"
          ],
          "reply": "¡Perfecto! Ya tenemos el perfil completo. ¡Gracias!",
          "hint": "Say \"Mi madre es doctora.\""
        }
      ],
      "nudges": {
        "g1": "Di tu nombre: «Me llamo…»",
        "g2": "Di tu ciudad: «Soy de…»",
        "g3": "Di cuántos hermanos tienes: «Tengo…»",
        "g4": "Di el trabajo de tu madre: «Mi madre es…»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós, Mara! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Me ",
        "after": " Sara.",
        "choices": [
          "llamo",
          "llama",
          "llamas"
        ],
        "answer": 0,
        "en": "My name is Sara."
      },
      {
        "before": "Tengo dos ",
        "after": ".",
        "choices": [
          "hermano",
          "hermanos",
          "hermana",
          "hermanas"
        ],
        "answer": 1,
        "en": "I have two brothers."
      },
      {
        "before": "Mi madre ",
        "after": " doctora.",
        "choices": [
          "son",
          "es",
          "está"
        ],
        "answer": 1,
        "en": "My mother is a doctor."
      },
      {
        "before": "Soy ",
        "after": " Chicago.",
        "choices": [
          "en",
          "a",
          "de"
        ],
        "answer": 2,
        "en": "I'm from Chicago."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿Cómo te llamas?"
          }
        ],
        "choices": [
          "Me llamo Diego.",
          "Tengo catorce años.",
          "Soy de México."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿De dónde eres?"
          }
        ],
        "choices": [
          "Sí, tengo dos.",
          "Soy de Chicago.",
          "Mi madre es doctora."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Cuántos hermanos tienes?"
          }
        ],
        "choices": [
          "Tengo dos hermanos.",
          "Me llamo Ana.",
          "Soy alto y simpático."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Me llamo Sara. Vivo en Chicago con mi familia. Mi madre es doctora y tengo dos hermanos.",
        "question": "What is Sara's mother's job?",
        "choices": [
          "She is a doctor.",
          "She works in a hotel.",
          "She is a teacher."
        ],
        "answer": 0
      },
      {
        "passage": "Shakira es colombiana. Es cantante y vive en Miami. Rafael Nadal es español y es tenista.",
        "question": "Where is Shakira from?",
        "choices": [
          "Spain",
          "Colombia",
          "Chicago"
        ],
        "answer": 1
      }
    ]
  },
];
