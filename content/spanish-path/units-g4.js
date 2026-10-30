// Grade 4 content for the main-path Spanish activities, the same shape as
// units-g1.js (see the field notes there). Written for the skill catch-up
// (services/spanish/catch-up.js) by scripts/spanish-catchup-content.js: drafted by
// DeepSeek (Standard Compute), every item checked by Mistral Large and Qwen 3.8 Max
// (xKiro); an item either rejected was rewritten and re-checked by both, or dropped.
// Reports: curriculum-build/spanish-catchup/. Do not edit by hand; re-run the build.

module.exports = [
  {
    topics: [
      { id: "regular_ar_verbs_in_the_pres", match: /Regular -AR Verbs in the Present/i },
      { id: "regular_er_verbs_in_the_pres", match: /Regular -ER Verbs in the Present/i },
      { id: "regular_ir_verbs_in_the_pres", match: /Regular -IR Verbs in the Present/i },
      { id: "ir_present_voy_vas_va", match: /Ir Present: Voy, Vas, Va/i },
    ],
    "unit": "Unit 4.1",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can use regular -ar, -er and -ir verbs and ir in the present to talk about what people do.",
    "phrases": [
      {
        "id": "g4u1_hablo_espanol",
        "es": "Hablo español.",
        "en": [
          "I speak Spanish."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "regular_ar_verbs_in_the_pres"
      },
      {
        "id": "g4u1_ellos_trabajan",
        "es": "Ellos trabajan.",
        "en": [
          "They work.",
          "They are working."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "regular_ar_verbs_in_the_pres"
      },
      {
        "id": "g4u1_compro_pan",
        "es": "Compro pan.",
        "en": [
          "I buy bread."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "regular_ar_verbs_in_the_pres"
      },
      {
        "id": "g4u1_estudiamos_mucho",
        "es": "Estudiamos mucho.",
        "en": [
          "We study a lot."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "regular_ar_verbs_in_the_pres"
      },
      {
        "id": "g4u1_como_en_casa",
        "es": "Como en casa.",
        "en": [
          "I eat at home."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "regular_er_verbs_in_the_pres"
      },
      {
        "id": "g4u1_bebo_cafe",
        "es": "Bebo café.",
        "en": [
          "I drink coffee."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "regular_er_verbs_in_the_pres"
      },
      {
        "id": "g4u1_aprendemos_espanol",
        "es": "Aprendemos español.",
        "en": [
          "We learn Spanish."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "regular_er_verbs_in_the_pres"
      },
      {
        "id": "g4u1_ellos_leen_mucho",
        "es": "Ellos leen mucho.",
        "en": [
          "They read a lot."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "regular_er_verbs_in_the_pres"
      },
      {
        "id": "g4u1_vivo_en_la_ciudad",
        "es": "Vivo en la ciudad.",
        "en": [
          "I live in the city."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "regular_ir_verbs_in_the_pres"
      },
      {
        "id": "g4u1_escribo_un_libro",
        "es": "Escribo un libro.",
        "en": [
          "I write a book."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "regular_ir_verbs_in_the_pres"
      },
      {
        "id": "g4u1_abrimos_la_puerta",
        "es": "Abrimos la puerta.",
        "en": [
          "We open the door."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "regular_ir_verbs_in_the_pres"
      },
      {
        "id": "g4u1_recibo_un_regalo",
        "es": "Recibo un regalo.",
        "en": [
          "I get a gift.",
          "I receive a gift."
        ],
        "tier": 3,
        "skill": "es_present_erir",
        "topic": "regular_ir_verbs_in_the_pres"
      },
      {
        "id": "g4u1_voy_a_la_tienda",
        "es": "Voy a la tienda.",
        "en": [
          "I'm going to the store.",
          "I go to the store.",
          "I am going to the store."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "ir_present_voy_vas_va"
      },
      {
        "id": "g4u1_adonde_vas",
        "es": "¿Adónde vas?",
        "en": [
          "Where are you going?",
          "Where do you go?"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "ir_present_voy_vas_va"
      },
      {
        "id": "g4u1_ella_va_al_trabajo",
        "es": "Ella va al trabajo.",
        "en": [
          "She goes to work.",
          "She is going to work."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "ir_present_voy_vas_va"
      }
    ],
    "scene": {
      "title": "En la casa nueva",
      "art": "casa",
      "lines": [
        {
          "who": "mara",
          "es": "Hola, Tomás. ¿Vives en esta casa?",
          "en": "Hi, Tomás. Do you live in this house?",
          "art": "casa"
        },
        {
          "who": "tomas",
          "es": "Sí, vivo aquí. Trabajo en un café.",
          "en": "Yes, I live here. I work in a café."
        },
        {
          "who": "mara",
          "es": "Yo estudio y también trabajo.",
          "en": "I study and I also work."
        },
        {
          "who": "diego",
          "es": "¿Adónde vas ahora?",
          "en": "Where are you going now?"
        },
        {
          "who": "mara",
          "es": "Voy a la tienda. Compro pan y leche.",
          "en": "I'm going to the store. I'm buying bread and milk."
        },
        {
          "who": "rosa",
          "es": "Nosotros comemos a las dos. ¿Comes con nosotros?",
          "en": "We eat at two. Are you eating with us?"
        },
        {
          "who": "tomas",
          "es": "Yo bebo café y leo un libro. ¡Hasta luego!",
          "en": "I drink coffee and read a book. See you later!"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "Where does Tomás work?",
          "choices": [
            "In a café",
            "In a store",
            "At a school"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "Where is Mara going now?",
          "choices": [
            "To the café",
            "To the store",
            "To work"
          ],
          "answer": 1
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What does Tomás do?",
          "choices": [
            "He eats with Rosa",
            "He studies and works",
            "He drinks coffee and reads a book"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "tomas",
      "partnerName": "Tomás",
      "setting": "Your new apartment. Tomás is your new roommate, and his weekday habits are the opposite of yours.",
      "learnerCard": "You describe your weekday to Tomás, your new roommate.",
      "learnerCardEs": "Habla de tu día. Usa verbos en presente.",
      "partnerCard": "Tomás is your new roommate. He works at night and sleeps in the morning.",
      "goals": [
        {
          "id": "work_study",
          "text": "Say where you work or study (Trabajo en… / Estudio en…)"
        },
        {
          "id": "eat_drink",
          "text": "Say what you eat or drink (Como… / Bebo…)"
        },
        {
          "id": "go",
          "text": "Say where you go (Voy a…)"
        },
        {
          "id": "read_live",
          "text": "Say what you read or where you live (Leo… / Vivo en…)"
        }
      ],
      "targets": [
        "Trabajo en…",
        "Estudio en…",
        "Como pan.",
        "Bebo café.",
        "Voy a…",
        "Vivo en…"
      ],
      "opening": "¡Hola! Yo trabajo de noche. ¿Y tú? ¿Trabajas o estudias?",
      "script": [
        {
          "goal": "work_study",
          "expect": [
            "trabaj",
            "estudi"
          ],
          "reply": "¡Interesante! Yo trabajo de noche. ¿Qué comes?",
          "hint": "Say \"Trabajo en una tienda.\""
        },
        {
          "goal": "eat_drink",
          "expect": [
            "como",
            "bebo",
            "tomo"
          ],
          "reply": "Yo no como mucho. Bebo café todo el día. ¿Adónde vas por la mañana?",
          "hint": "Say \"Como pan y bebo leche.\""
        },
        {
          "goal": "go",
          "expect": [
            "voy",
            "tienda",
            "escuela",
            "trabajo"
          ],
          "reply": "Yo voy al trabajo en tren. ¿Lees mucho?",
          "hint": "Say \"Voy a la tienda.\""
        },
        {
          "goal": "read_live",
          "expect": [
            "leo",
            "libro",
            "vivo"
          ],
          "reply": "Yo no leo libros, pero escucho música. ¡Buenas noches!",
          "hint": "Say \"Leo un libro en casa.\""
        }
      ],
      "nudges": {
        "work_study": "¿Trabajas o estudias?",
        "eat_drink": "¿Qué comes?",
        "go": "¿Adónde vas?",
        "read_live": "¿Lees mucho? ¿Dónde vives?"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Hasta luego! Nos vemos en casa.",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Yo ",
        "after": " en una tienda.",
        "choices": [
          "trabajas",
          "trabajo",
          "trabajan"
        ],
        "answer": 1,
        "en": "I work in a store."
      },
      {
        "before": "Nosotros ",
        "after": " español.",
        "choices": [
          "aprenden",
          "aprende",
          "aprendemos"
        ],
        "answer": 2,
        "en": "We learn Spanish."
      },
      {
        "before": "¿",
        "after": " tú en la ciudad?",
        "choices": [
          "Vive",
          "Vives",
          "Vivo"
        ],
        "answer": 1,
        "en": "Do you live in the city?"
      },
      {
        "before": "Ella ",
        "after": " al trabajo.",
        "choices": [
          "va",
          "vas",
          "voy"
        ],
        "answer": 0,
        "en": "She goes to work."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Vives aquí?"
          }
        ],
        "choices": [
          "Sí, vivo aquí.",
          "Sí, como aquí.",
          "Sí, escribo aquí."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Adónde vas?"
          }
        ],
        "choices": [
          "Vas a la tienda.",
          "Voy a la tienda.",
          "Va a la tienda."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "¿Qué comes por la mañana?"
          }
        ],
        "choices": [
          "Como pan y bebo café.",
          "Come pan y bebe café.",
          "Comes pan y bebes café."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Tomás vive en la ciudad. Trabaja en un café y estudia en la escuela. Por la mañana bebe café y lee un libro.",
        "question": "What does Tomás do in the morning?",
        "choices": [
          "He works in a store.",
          "He drinks coffee and reads a book.",
          "He writes a book."
        ],
        "answer": 1
      },
      {
        "passage": "Rosa y Mara estudian mucho. Ellas escriben y leen en casa. Los viernes van a la tienda y compran pan.",
        "question": "Where do Rosa and Mara go on Fridays?",
        "choices": [
          "To the store",
          "To the café",
          "To work"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "querer_poder_and_preferir_wi", match: /Querer, Poder, and Preferir with Infinitives/i },
      { id: "no_do_support_asking_and_neg", match: /No Do-Support: Asking and Negating in the Present/i },
      { id: "telling_time_que_hora_es", match: /Telling Time: Qué Hora Es/i },
      { id: "minutes_half_past_and_quarte", match: /Minutes, Half Past, and Quarter To/i },
    ],
    "unit": "Unit 4.2",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can use querer, poder and preferir with infinitives, ask and negate in the present, and tell time.",
    "phrases": [
      {
        "id": "g4u2_quiero_comer",
        "es": "Quiero comer.",
        "en": [
          "I want to eat."
        ],
        "alt": [
          "Yo quiero comer."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "querer_poder_and_preferir_wi"
      },
      {
        "id": "g4u2_puedes_venir",
        "es": "¿Puedes venir?",
        "en": [
          "Can you come?"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "querer_poder_and_preferir_wi"
      },
      {
        "id": "g4u2_no_puedo",
        "es": "No puedo.",
        "en": [
          "I can't.",
          "I cannot."
        ],
        "alt": [
          "Yo no puedo."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "querer_poder_and_preferir_wi"
      },
      {
        "id": "g4u2_prefiero_salir",
        "es": "Prefiero salir.",
        "en": [
          "I prefer to go out."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "querer_poder_and_preferir_wi"
      },
      {
        "id": "g4u2_trabajas_aqui",
        "es": "¿Trabajas aquí?",
        "en": [
          "Do you work here?",
          "Are you working here?"
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "no_do_support_asking_and_neg"
      },
      {
        "id": "g4u2_no_como_carne",
        "es": "No como carne.",
        "en": [
          "I don't eat meat.",
          "I do not eat meat."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "no_do_support_asking_and_neg"
      },
      {
        "id": "g4u2_hablas_ingles",
        "es": "¿Hablas inglés?",
        "en": [
          "Do you speak English?"
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "no_do_support_asking_and_neg"
      },
      {
        "id": "g4u2_no_trabajo_hoy",
        "es": "No trabajo hoy.",
        "en": [
          "I'm not working today.",
          "I don't work today."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "no_do_support_asking_and_neg"
      },
      {
        "id": "g4u2_que_hora_es",
        "es": "¿Qué hora es?",
        "en": [
          "What time is it?",
          "What's the time?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "telling_time_que_hora_es"
      },
      {
        "id": "g4u2_son_las_tres",
        "es": "Son las tres.",
        "en": [
          "It's three o'clock.",
          "It is three o'clock."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "telling_time_que_hora_es"
      },
      {
        "id": "g4u2_es_la_una",
        "es": "Es la una.",
        "en": [
          "It's one o'clock."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "telling_time_que_hora_es"
      },
      {
        "id": "g4u2_es_mediodia",
        "es": "Es mediodía.",
        "en": [
          "It's noon.",
          "It's midday."
        ],
        "tier": 3,
        "skill": "es_numbers",
        "topic": "telling_time_que_hora_es"
      },
      {
        "id": "g4u2_son_las_tres_y_media",
        "es": "Son las tres y media.",
        "en": [
          "It's three thirty.",
          "It's half past three."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "minutes_half_past_and_quarte"
      },
      {
        "id": "g4u2_son_las_dos_y_cuarto",
        "es": "Son las dos y cuarto.",
        "en": [
          "It's quarter past two.",
          "It's two fifteen."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "minutes_half_past_and_quarte"
      },
      {
        "id": "g4u2_son_las_cinco_menos_veinte",
        "es": "Son las cinco menos veinte.",
        "en": [
          "It's twenty to five.",
          "It's four forty."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "minutes_half_past_and_quarte"
      },
      {
        "id": "g4u2_son_las_ocho_en_punto",
        "es": "Son las ocho en punto.",
        "en": [
          "It's eight o'clock exactly.",
          "It's exactly eight."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "minutes_half_past_and_quarte"
      }
    ],
    "scene": {
      "title": "La reunión a las cinco y media",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Son las dos y cuarto. Mara y Tomás están en un café.",
          "en": "It's two fifteen. Mara and Tomás are in a café.",
          "art": "cafe"
        },
        {
          "who": "mara",
          "es": "¿Puedes venir a las cinco?",
          "en": "Can you come at five?"
        },
        {
          "who": "mara",
          "es": "¿Qué hora es ahora?",
          "en": "What time is it now?"
        },
        {
          "who": "tomas",
          "es": "Son las dos y cuarto. Prefiero venir a las cuatro en punto.",
          "en": "It's two fifteen. I prefer to come at four o'clock exactly."
        },
        {
          "who": "rosa",
          "es": "Quiero venir. ¿Puedo venir a las cinco y media?",
          "en": "I want to come. Can I come at five thirty?"
        },
        {
          "who": "diego",
          "es": "Sí, a las cinco y media. ¡Perfecto!",
          "en": "Yes, at five thirty. Perfect!"
        },
        {
          "who": "mara",
          "es": "Bien. ¡Hasta las cinco y media!",
          "en": "Good. See you at five thirty!"
        }
      ],
      "questions": [
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What time does Tomás prefer?",
          "choices": [
            "Four o'clock exactly",
            "Five o'clock",
            "Two fifteen"
          ],
          "answer": 0
        }
      ]
    },
    "convo": null,
    "fills": [
      {
        "before": "Quiero",
        "after": "a las cinco.",
        "choices": [
          "comer",
          "come",
          "como"
        ],
        "answer": 0,
        "en": "I want to eat at five."
      },
      {
        "before": "No",
        "after": "carne.",
        "choices": [
          "como",
          "comes",
          "come"
        ],
        "answer": 0,
        "en": "I don't eat meat."
      },
      {
        "before": "Son las tres y",
        "after": ".",
        "choices": [
          "media",
          "mediodía",
          "punto"
        ],
        "answer": 0,
        "en": "It's half past three."
      },
      {
        "before": "¿Puedes",
        "after": "mañana?",
        "choices": [
          "venir",
          "viene",
          "vienes"
        ],
        "answer": 0,
        "en": "Can you come tomorrow?"
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Qué hora es?"
          }
        ],
        "choices": [
          "Son las tres y media.",
          "Sí, puedo.",
          "No como carne."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Puedes venir a las cuatro?"
          }
        ],
        "choices": [
          "No puedo. Prefiero venir a las cinco.",
          "Son las cuatro y cuarto.",
          "¿Trabajas aquí?"
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Trabajas aquí?"
          }
        ],
        "choices": [
          "Sí, trabajo aquí.",
          "Sí, son las dos.",
          "No puedo salir."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara quiere una reunión. «¿Puedes venir a las cinco?», pregunta. Tomás dice: «No puedo. Prefiero venir a las cinco y media.»",
        "question": "What",
        "choices": [
          "Five thirty",
          "Five o'clock",
          "Four thirty"
        ],
        "answer": 0
      },
      {
        "passage": "Son las dos y cuarto. Rosa trabaja en un café. «¿Qué hora es?», pregunta Diego. «Son las dos y cuarto», dice Rosa.",
        "question": "What time is it?",
        "choices": [
          "Two fifteen",
          "Two forty-five",
          "Three fifteen"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "at_what_time_a_las_ocho", match: /At What Time: A Las Ocho/i },
      { id: "days_months_and_seasons", match: /Days, Months, and Seasons/i },
      { id: "dates_and_birthdays", match: /Dates and Birthdays/i },
      { id: "meals_and_mealtimes", match: /Meals and Mealtimes/i },
    ],
    "unit": "Unit 4.3",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can say at what time things happen and talk about days, months, seasons, dates, birthdays and meals.",
    "phrases": [
      {
        "id": "g4u3_a_las_ocho_de_la_manana",
        "es": "A las ocho de la mañana.",
        "en": [
          "At eight in the morning.",
          "At 8 a.m."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "at_what_time_a_las_ocho"
      },
      {
        "id": "g4u3_a_que_hora_empieza",
        "es": "¿A qué hora empieza?",
        "en": [
          "What time does it start?",
          "At what time does it start?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "at_what_time_a_las_ocho"
      },
      {
        "id": "g4u3_la_clase_empieza_a_las_nueve",
        "es": "La clase empieza a las nueve.",
        "en": [
          "Class starts at nine.",
          "The class starts at nine."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "at_what_time_a_las_ocho"
      },
      {
        "id": "g4u3_son_las_dos_de_la_tarde",
        "es": "Son las dos de la tarde.",
        "en": [
          "It's two in the afternoon.",
          "It is two in the afternoon."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "at_what_time_a_las_ocho"
      },
      {
        "id": "g4u3_en_enero_hace_frio",
        "es": "En enero hace frío.",
        "en": [
          "In January it's cold.",
          "It is cold in January."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "days_months_and_seasons"
      },
      {
        "id": "g4u3_el_lunes_tengo_clase",
        "es": "El lunes tengo clase.",
        "en": [
          "On Monday I have class.",
          "I have class on Monday."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "days_months_and_seasons"
      },
      {
        "id": "g4u3_en_el_verano_hace_calor",
        "es": "En el verano hace calor.",
        "en": [
          "In the summer it's hot.",
          "It is hot in the summer."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "days_months_and_seasons"
      },
      {
        "id": "g4u3_mi_mes_favorito_es_octubre",
        "es": "Mi mes favorito es octubre.",
        "en": [
          "My favorite month is October."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "days_months_and_seasons"
      },
      {
        "id": "g4u3_el_otono_es_bonito",
        "es": "El otoño es bonito.",
        "en": [
          "Autumn is pretty.",
          "Fall is nice."
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "days_months_and_seasons"
      },
      {
        "id": "g4u3_cual_es_la_fecha",
        "es": "¿Cuál es la fecha?",
        "en": [
          "What's the date?",
          "What is the date?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "dates_and_birthdays"
      },
      {
        "id": "g4u3_mi_cumpleanos_es_el_cinco_de",
        "es": "Mi cumpleaños es el cinco de mayo.",
        "en": [
          "My birthday is May fifth.",
          "My birthday is on the fifth of May."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "dates_and_birthdays"
      },
      {
        "id": "g4u3_hoy_es_el_primero_de_marzo",
        "es": "Hoy es el primero de marzo.",
        "en": [
          "Today is March first.",
          "Today is the first of March."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "dates_and_birthdays"
      },
      {
        "id": "g4u3_cuando_es_tu_cumpleanos",
        "es": "¿Cuándo es tu cumpleaños?",
        "en": [
          "When is your birthday?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "dates_and_birthdays"
      },
      {
        "id": "g4u3_el_desayuno",
        "es": "el desayuno",
        "en": [
          "breakfast",
          "the breakfast"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "meals_and_mealtimes"
      },
      {
        "id": "g4u3_ceno_a_las_nueve",
        "es": "Ceno a las nueve.",
        "en": [
          "I have dinner at nine.",
          "I eat dinner at nine."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "meals_and_mealtimes"
      }
    ],
    "scene": {
      "title": "La cena de cumpleaños",
      "art": "mesa",
      "lines": [
        {
          "who": "narrator",
          "es": "Es lunes. Mara y Diego hablan del cumpleaños de Rosa.",
          "en": "It's Monday. Mara and Diego are talking about Rosa's birthday.",
          "art": "mesa"
        },
        {
          "who": "mara",
          "es": "El cumpleaños de Rosa es el cinco de mayo.",
          "en": "Rosa's birthday is May fifth."
        },
        {
          "who": "diego",
          "es": "¿Y qué día es la cena?",
          "en": "And what day is the dinner?"
        },
        {
          "who": "mara",
          "es": "El viernes. La cena es a las ocho de la noche.",
          "en": "Friday. Dinner is at eight at night."
        },
        {
          "who": "diego",
          "es": "Yo trabajo el viernes a las seis de la tarde.",
          "en": "I work on Friday at six in the evening."
        },
        {
          "who": "mara",
          "es": "No hay problema. La cena empieza a las ocho.",
          "en": "No problem. Dinner starts at eight."
        },
        {
          "who": "diego",
          "es": "Perfecto. ¡Nos vemos el viernes!",
          "en": "Perfect. See you on Friday!"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "When is Rosa's birthday?",
          "choices": [
            "May fifth",
            "March first",
            "January fifth"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What time is the dinner?",
          "choices": [
            "At six in the evening",
            "At eight at night",
            "At two in the afternoon"
          ],
          "answer": 1
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "What does Diego do on Friday at six?",
          "choices": [
            "He works",
            "He has dinner",
            "He starts class"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "You and Diego are planning a birthday dinner for Rosa. Each of you has half of your friends' schedules.",
      "learnerCard": "You have the dates and the morning schedules. Ask Diego the date and the time, and say when the birthday is and when you have dinner.",
      "learnerCardEs": "Tú tienes las fechas y los horarios de la mañana. Pregunta a Diego la fecha y la hora.",
      "partnerCard": "Diego has the evening schedules. He knows what time the dinner starts and when people are free.",
      "goals": [
        {
          "id": "ask_date",
          "text": "Ask what today's date is (¿Cuál es la fecha?)"
        },
        {
          "id": "ask_time",
          "text": "Ask what time the dinner starts (¿A qué hora empieza?)"
        },
        {
          "id": "say_birthday",
          "text": "Say the birthday is the fifth of May (El cumpleaños es el cinco de mayo.)"
        },
        {
          "id": "say_dinner",
          "text": "Say you have dinner at nine (Ceno a las nueve.)"
        }
      ],
      "targets": [
        "¿Cuál es la fecha?",
        "¿A qué hora empieza?",
        "el cinco de mayo",
        "Ceno a las nueve.",
        "el viernes"
      ],
      "opening": "¡Hola! Yo tengo los horarios de la noche. ¿Empezamos?",
      "script": [
        {
          "goal": "ask_date",
          "expect": [
            "cual",
            "fecha",
            "es"
          ],
          "reply": "Hoy es el primero de mayo.",
          "hint": "Say \"¿Cuál es la fecha?\""
        },
        {
          "goal": "ask_time",
          "expect": [
            "a que hora",
            "empieza"
          ],
          "reply": "La cena empieza a las ocho de la noche.",
          "hint": "Say \"¿A qué hora empieza la cena?\""
        },
        {
          "goal": "say_birthday",
          "expect": [
            "cumpleanos",
            "cinco",
            "mayo"
          ],
          "reply": "¡Perfecto! El cinco de mayo es viernes.",
          "hint": "Say \"El cumpleaños de Rosa es el cinco de mayo.\""
        },
        {
          "goal": "say_dinner",
          "expect": [
            "ceno",
            "nueve"
          ],
          "reply": "Muy bien. Yo ceno a las ocho y llego a las nueve.",
          "hint": "Say \"Ceno a las nueve.\""
        }
      ],
      "nudges": {
        "ask_date": "Pregunta: ¿Cuál es la fecha?",
        "ask_time": "Pregunta: ¿A qué hora empieza la cena?",
        "say_birthday": "Di: El cumpleaños es el cinco de mayo.",
        "say_dinner": "Di: Ceno a las nueve."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Perfecto! Nos vemos el viernes a las ocho. ¡Adiós!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "La clase",
        "after": "a las nueve.",
        "choices": [
          "empieza",
          "empiezan",
          "empezar"
        ],
        "answer": 0,
        "en": "Class starts at nine."
      },
      {
        "before": "Mi cumpleaños es",
        "after": "cinco de mayo.",
        "choices": [
          "el",
          "la",
          "los"
        ],
        "answer": 0,
        "en": "My birthday is May fifth."
      },
      {
        "before": "Yo ",
        "after": "a las dos.",
        "choices": [
          "almuerzo",
          "almuerza",
          "almuerzas"
        ],
        "answer": 0,
        "en": "I have lunch at two."
      },
      {
        "before": "Son",
        "after": "dos de la tarde.",
        "choices": [
          "las",
          "los",
          "la"
        ],
        "answer": 0,
        "en": "It's two in the afternoon."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿A qué hora es la cena?"
          }
        ],
        "choices": [
          "Son las ocho de la mañana.",
          "A las ocho de la noche.",
          "El cinco de mayo."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Cuándo es tu cumpleaños?"
          }
        ],
        "choices": [
          "Ceno a las nueve.",
          "Mi cumpleaños es el doce de diciembre.",
          "Sí, gracias."
        ],
        "answer": 1
      }
    ],
    "reads": [
      {
        "passage": "Hoy es el primero de mayo. El cumpleaños de Rosa es el cinco de mayo. La cena empieza a las ocho de la noche.",
        "question": "When is Rosa's birthday?",
        "choices": [
          "May first",
          "May fifth",
          "At eight at night"
        ],
        "answer": 1
      },
      {
        "passage": "En enero hace frío. En el verano hace calor. Mi mes favorito es octubre.",
        "question": "What is the person's favorite month?",
        "choices": [
          "January",
          "October",
          "Summer"
        ],
        "answer": 1
      }
    ]
  },
  {
    topics: [
      { id: "tapas_raciones_and_ordering_", match: /Tapas, Raciones, and Ordering at a Spanish Bar/i },
      { id: "breakfast_foods_and_drinks", match: /Breakfast Foods and Drinks/i },
      { id: "fruits_and_vegetables", match: /Fruits and Vegetables/i },
      { id: "meat_fish_grains_and_dairy", match: /Meat, Fish, Grains, and Dairy/i },
    ],
    "unit": "Unit 4.4",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can name common breakfast foods, fruits, vegetables, meats, fish, grains, and dairy products.",
    "phrases": [
      {
        "id": "g4u4_una_racion_de_tortilla_por_f",
        "es": "Una ración de tortilla, por favor.",
        "en": [
          "A portion of tortilla, please.",
          "One portion of tortilla, please."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "tapas_raciones_and_ordering_"
      },
      {
        "id": "g4u4_una_racion_de_jamon",
        "es": "Una ración de jamón.",
        "en": [
          "A portion of ham.",
          "A plate of ham."
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "tapas_raciones_and_ordering_"
      },
      {
        "id": "g4u4_la_cuenta_por_favor",
        "es": "La cuenta, por favor.",
        "en": [
          "The check, please.",
          "The bill, please."
        ],
        "tier": 1,
        "skill": "es_greetings",
        "topic": "tapas_raciones_and_ordering_"
      },
      {
        "id": "g4u4_pedimos_media_racion",
        "es": "Pedimos media ración.",
        "en": [
          "We order a half portion.",
          "We're ordering a half portion."
        ],
        "tier": 3,
        "skill": "es_present_erir",
        "topic": "tapas_raciones_and_ordering_"
      },
      {
        "id": "g4u4_el_desayuno",
        "es": "el desayuno",
        "en": [
          "breakfast",
          "the breakfast"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "breakfast_foods_and_drinks"
      },
      {
        "id": "g4u4_el_zumo_de_naranja",
        "es": "el zumo de naranja",
        "en": [
          "orange juice"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "breakfast_foods_and_drinks"
      },
      {
        "id": "g4u4_la_leche",
        "es": "la leche",
        "en": [
          "milk"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "breakfast_foods_and_drinks",
        "art": "leche"
      },
      {
        "id": "g4u4_como_huevos_y_pan",
        "es": "Como huevos y pan.",
        "en": [
          "I eat eggs and bread.",
          "I have eggs and bread."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "breakfast_foods_and_drinks"
      },
      {
        "id": "g4u4_las_manzanas",
        "es": "las manzanas",
        "en": [
          "the apples",
          "apples"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "fruits_and_vegetables"
      },
      {
        "id": "g4u4_el_platano",
        "es": "el plátano",
        "en": [
          "the banana",
          "banana"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "fruits_and_vegetables"
      },
      {
        "id": "g4u4_el_tomate",
        "es": "el tomate",
        "en": [
          "the tomato",
          "tomato"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "fruits_and_vegetables"
      },
      {
        "id": "g4u4_la_cebolla",
        "es": "la cebolla",
        "en": [
          "the onion",
          "onion"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "fruits_and_vegetables"
      },
      {
        "id": "g4u4_el_pollo",
        "es": "el pollo",
        "en": [
          "the chicken",
          "chicken"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "meat_fish_grains_and_dairy"
      },
      {
        "id": "g4u4_el_pescado",
        "es": "el pescado",
        "en": [
          "the fish",
          "fish"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "meat_fish_grains_and_dairy"
      },
      {
        "id": "g4u4_el_arroz",
        "es": "el arroz",
        "en": [
          "the rice",
          "rice"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "meat_fish_grains_and_dairy"
      },
      {
        "id": "g4u4_el_queso",
        "es": "el queso",
        "en": [
          "the cheese",
          "cheese"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "meat_fish_grains_and_dairy"
      }
    ],
    "scene": {
      "title": "El desayuno en la cocina",
      "art": "mesa",
      "lines": [
        {
          "who": "narrator",
          "es": "Es la mañana. Mara y Tomás preparan el desayuno.",
          "en": "It is morning. Mara and Tomás are preparing breakfast.",
          "art": "mesa"
        },
        {
          "who": "mara",
          "es": "¿Qué hay para el desayuno?",
          "en": "What is there for breakfast?"
        },
        {
          "who": "Tomás",
          "es": "Hay huevos, pan y zumo de naranja.",
          "en": "There are eggs, bread, and orange juice."
        },
        {
          "who": "mara",
          "es": "¿Y la leche?",
          "en": "And the milk?"
        },
        {
          "who": "tomas",
          "es": "La leche está en la mesa.",
          "en": "The milk is on the table."
        },
        {
          "who": "rosa",
          "es": "Yo como una manzana y un plátano.",
          "en": "I eat an apple and a banana."
        },
        {
          "who": "diego",
          "es": "Hay pollo, arroz y queso en la cocina.",
          "en": "There is chicken, rice, and cheese in the kitchen."
        }
      ],
      "questions": [
        {
          "after": 1,
          "kind": "read_respond",
          "question": "Who is preparing breakfast?",
          "choices": [
            "Mara and Tomás",
            "Rosa and Diego",
            "Only Tomás"
          ],
          "answer": 0
        },
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What drink is there?",
          "choices": [
            "Orange juice",
            "Milk",
            "Coffee"
          ],
          "answer": 0
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What foods are in the kitchen?",
          "choices": [
            "Chicken, rice, and cheese",
            "Fish, bread, and milk",
            "Eggs, onions, and potatoes"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "Rosa's kitchen, with a pantry list on the table.",
      "learnerCard": "You have the recipe's ingredients: chicken, rice, eggs, tomatoes, and onions. Compare with Rosa's pantry list and say what is missing.",
      "learnerCardEs": "Tú tienes los ingredientes de la receta: pollo, arroz, huevos, tomates y cebollas. Compara con la lista de Rosa y di qué falta.",
      "partnerCard": "You are Rosa. You have a pantry list: milk, cheese, rice, and chicken. The recipe needs eggs, tomatoes, and onions too. Ask the learner what is on the list and what is missing.",
      "goals": [
        {
          "id": "g1",
          "text": "Ask what is on the list (¿Qué hay en la lista?)"
        },
        {
          "id": "g2",
          "text": "Say there is milk and cheese (Hay leche y queso.)"
        },
        {
          "id": "g3",
          "text": "Say there are no eggs (No hay huevos.)"
        },
        {
          "id": "g4",
          "text": "Say tomatoes and onions are missing (Faltan tomates y cebollas.)"
        }
      ],
      "targets": [
        "¿Qué hay en la lista?",
        "Hay leche y queso.",
        "No hay huevos.",
        "Faltan tomates y cebollas.",
        "Tengo pollo y arroz."
      ],
      "opening": "Tengo la lista de comida. ¿Qué hay en tu receta?",
      "script": [
        {
          "goal": "g1",
          "expect": [
            "que",
            "hay",
            "lista"
          ],
          "reply": "Hay leche, queso, arroz y pollo.",
          "hint": "Say \"¿Qué hay en la lista?\""
        },
        {
          "goal": "g2",
          "expect": [
            "hay",
            "leche",
            "queso"
          ],
          "reply": "Sí, hay leche y queso.",
          "hint": "Say \"Hay leche y queso.\""
        },
        {
          "goal": "g3",
          "expect": [
            "no",
            "hay",
            "huevos"
          ],
          "reply": "No hay huevos. ¿Qué más falta?",
          "hint": "Say \"No hay huevos.\""
        },
        {
          "goal": "g4",
          "expect": [
            "faltan",
            "tomates",
            "cebollas"
          ],
          "reply": "¡Ah! Faltan tomates y cebollas. ¡Gracias!",
          "hint": "Say \"Faltan tomates y cebollas.\""
        }
      ],
      "nudges": {
        "g1": "Pregunta: «¿Qué hay en la lista?»",
        "g2": "Di: «Hay leche y queso.»",
        "g3": "Di: «No hay huevos.»",
        "g4": "Di: «Faltan tomates y cebollas.»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Bueno! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Como pan con ",
        "after": ".",
        "choices": [
          "queso",
          "leche",
          "manzana"
        ],
        "answer": 0,
        "en": "I eat bread with cheese."
      },
      {
        "before": "Bebo ",
        "after": " de naranja.",
        "choices": [
          "jugo",
          "pollo",
          "arroz"
        ],
        "answer": 0,
        "en": "I drink orange juice."
      },
      {
        "before": "",
        "after": " es una fruta.",
        "choices": [
          "La manzana",
          "La cebolla",
          "La patata"
        ],
        "answer": 0,
        "en": "The apple is a fruit."
      },
      {
        "before": "Hay ",
        "after": " y arroz.",
        "choices": [
          "pollo",
          "leche",
          "jugo"
        ],
        "answer": 0,
        "en": "There is chicken and rice."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Qué hay para el desayuno?"
          }
        ],
        "choices": [
          "Hay huevos y pan.",
          "La cuenta, por favor.",
          "Soy un plátano."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Te gusta el jugo de naranja?"
          }
        ],
        "choices": [
          "Sí, me gusta.",
          "No hay huevos.",
          "Una ración de jamón."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Hay queso en la cocina?"
          }
        ],
        "choices": [
          "Sí, hay queso.",
          "Sí, soy queso.",
          "La leche es una fruta."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara come huevos y pan para el desayuno. Bebe jugo de naranja. No bebe café.",
        "question": "What does Mara drink?",
        "choices": [
          "Orange juice",
          "Coffee",
          "Milk"
        ],
        "answer": 0
      },
      {
        "passage": "En la cocina hay pollo, arroz y queso. No hay pescado. Rosa dice: «Faltan tomates y cebollas.»",
        "question": "What is missing?",
        "choices": [
          "Tomatoes and onions",
          "Chicken and rice",
          "Cheese and milk"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "hunger_and_thirst_tener_hamb", match: /Hunger and Thirst: Tener Hambre, Tener Sed/i },
      { id: "foods_of_the_spanish_speakin", match: /Foods of the Spanish-Speaking World/i },
      { id: "me_gusta_and_me_encanta_as_s", match: /Me Gusta and Me Encanta as Set Phrases/i },
      { id: "asking_about_likes_te_gusta_", match: /Asking About Likes: Te Gusta, Le Gusta, and Te Gustan/i },
    ],
    "unit": "Unit 4.5",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can say I am hungry or thirsty and ask others what they like to eat and drink.",
    "phrases": [
      {
        "id": "g4u5_tengo_hambre",
        "es": "Tengo hambre.",
        "en": [
          "I'm hungry.",
          "I am hungry."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "hunger_and_thirst_tener_hamb"
      },
      {
        "id": "g4u5_tengo_sed",
        "es": "Tengo sed.",
        "en": [
          "I'm thirsty.",
          "I am thirsty."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "hunger_and_thirst_tener_hamb"
      },
      {
        "id": "g4u5_tienes_hambre",
        "es": "¿Tienes hambre?",
        "en": [
          "Are you hungry?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "hunger_and_thirst_tener_hamb"
      },
      {
        "id": "g4u5_mi_amigo_tiene_sed",
        "es": "Mi amigo tiene sed.",
        "en": [
          "My friend is thirsty."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "hunger_and_thirst_tener_hamb"
      },
      {
        "id": "g4u5_los_tacos",
        "es": "los tacos",
        "en": [
          "tacos"
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "foods_of_the_spanish_speakin"
      },
      {
        "id": "g4u5_la_paella",
        "es": "la paella",
        "en": [
          "paella"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "foods_of_the_spanish_speakin"
      },
      {
        "id": "g4u5_las_arepas",
        "es": "las arepas",
        "en": [
          "arepas"
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "foods_of_the_spanish_speakin"
      },
      {
        "id": "g4u5_la_tortilla_espanola",
        "es": "la tortilla española",
        "en": [
          "Spanish omelet",
          "Spanish tortilla"
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "foods_of_the_spanish_speakin"
      },
      {
        "id": "g4u5_me_gusta_el_cafe",
        "es": "Me gusta el café.",
        "en": [
          "I like coffee."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "me_gusta_and_me_encanta_as_s"
      },
      {
        "id": "g4u5_me_gustan_los_tacos",
        "es": "Me gustan los tacos.",
        "en": [
          "I like tacos."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "me_gusta_and_me_encanta_as_s"
      },
      {
        "id": "g4u5_me_encantan_los_tacos",
        "es": "Me encantan los tacos.",
        "en": [
          "I love tacos.",
          "I really like tacos."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "me_gusta_and_me_encanta_as_s"
      },
      {
        "id": "g4u5_no_me_gusta_la_leche",
        "es": "No me gusta la leche.",
        "en": [
          "I don't like milk."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "me_gusta_and_me_encanta_as_s"
      },
      {
        "id": "g4u5_te_gusta_el_cafe",
        "es": "¿Te gusta el café?",
        "en": [
          "Do you like coffee?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "asking_about_likes_te_gusta_"
      },
      {
        "id": "g4u5_te_gustan_los_tacos",
        "es": "¿Te gustan los tacos?",
        "en": [
          "Do you like tacos?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "asking_about_likes_te_gusta_"
      },
      {
        "id": "g4u5_si_mucho",
        "es": "Sí, mucho.",
        "en": [
          "Yes, a lot.",
          "Yes, very much."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "asking_about_likes_te_gusta_"
      },
      {
        "id": "g4u5_te_gusta_la_fruta",
        "es": "¿Te gusta la fruta?",
        "en": [
          "Do you like fruit?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "asking_about_likes_te_gusta_"
      }
    ],
    "scene": {
      "title": "Un almuerzo juntos",
      "art": "pan",
      "lines": [
        {
          "who": "mara",
          "es": "¡Tengo hambre!",
          "en": "I'm hungry!",
          "art": "pan"
        },
        {
          "who": "tomas",
          "es": "Yo también. ¿Te gustan los tacos?",
          "en": "Me too. Do you like tacos?"
        },
        {
          "who": "mara",
          "es": "Sí, mucho. Me encantan los tacos.",
          "en": "Yes, a lot. I love tacos."
        },
        {
          "who": "tomas",
          "es": "¿Y Rosa? ¿Le gustan los tacos?",
          "en": "And Rosa? Does she like tacos?"
        },
        {
          "who": "rosa",
          "es": "No mucho. Me gusta la paella.",
          "en": "Not much. I like paella."
        },
        {
          "who": "diego",
          "es": "Yo tengo sed. ¿Hay agua?",
          "en": "I'm thirsty. Is there water?"
        },
        {
          "who": "mara",
          "es": "Sí, hay agua y también fruta.",
          "en": "Yes, there's water and fruit too."
        },
        {
          "who": "tomas",
          "es": "¡Perfecto! Vamos a comer.",
          "en": "Perfect! Let's go eat."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Tomás ask Mara?",
          "choices": [
            "If she likes tacos",
            "If she is thirsty",
            "If she likes coffee"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "What does Rosa like?",
          "choices": [
            "Tacos",
            "Paella",
            "Fruit"
          ],
          "answer": 1
        },
        {
          "after": 6,
          "kind": "read_respond",
          "question": "Who is thirsty?",
          "choices": [
            "Mara",
            "Tomás",
            "Diego"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "You and Diego are planning a shared lunch and talking about food you both like.",
      "learnerCard": "You are planning lunch with Diego. Say you are hungry and thirsty, ask what he likes, and say what you love.",
      "learnerCardEs": "Tienes hambre y tienes sed. Hablas del almuerzo con Diego.",
      "partnerCard": "Diego is hungry too and wants to find a lunch you both like.",
      "goals": [
        {
          "id": "hungry",
          "text": "Say you are hungry (Tengo hambre)."
        },
        {
          "id": "thirsty",
          "text": "Say you are thirsty too (Tengo sed)."
        },
        {
          "id": "ask",
          "text": "Ask Diego if he likes tacos (¿Te gustan los tacos?)."
        },
        {
          "id": "like",
          "text": "Say you love tacos (Me encantan los tacos)."
        }
      ],
      "targets": [
        "Tengo hambre.",
        "Tengo sed.",
        "¿Te gustan los tacos?",
        "Me encantan los tacos.",
        "Me gusta la paella.",
        "¿Te gusta el café?"
      ],
      "opening": "¡Hola! Tengo hambre. ¿Y tú?",
      "script": [
        {
          "goal": "hungry",
          "expect": [
            "tengo",
            "hambre"
          ],
          "reply": "Yo también tengo hambre. ¿Y tú?",
          "hint": "Say \"Tengo hambre.\""
        },
        {
          "goal": "thirsty",
          "expect": [
            "tengo",
            "sed"
          ],
          "reply": "¿Tienes sed? Hay agua en la mesa.",
          "hint": "Say \"Tengo sed.\""
        },
        {
          "goal": "ask",
          "expect": [
            "te",
            "gusta",
            "gustan"
          ],
          "reply": "Sí, me gustan mucho los tacos. ¿Y a ti?",
          "hint": "Say \"¿Te gustan los tacos?\""
        },
        {
          "goal": "like",
          "expect": [
            "me",
            "gusta",
            "gustan",
            "encanta"
          ],
          "reply": "¡Perfecto! Vamos a comer tacos y fruta.",
          "hint": "Say \"Me encantan los tacos.\""
        }
      ],
      "nudges": {
        "hungry": "Di: «Tengo hambre.»",
        "thirsty": "Di: «Tengo sed.»",
        "ask": "Pregunta: «¿Te gustan los tacos?»",
        "like": "Di: «Me encantan los tacos.»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Adiós! ¡Buen almuerzo!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Tengo",
        "after": ", quiero agua.",
        "choices": [
          "hambre",
          "sed",
          "gusta"
        ],
        "answer": 1,
        "en": "I'm thirsty, I want water."
      },
      {
        "before": "Me",
        "after": " el café.",
        "choices": [
          "gustan",
          "gustas",
          "gusta"
        ],
        "answer": 2,
        "en": "I like coffee."
      },
      {
        "before": "¿Te",
        "after": " los tacos?",
        "choices": [
          "gustan",
          "gusta",
          "gustas"
        ],
        "answer": 0,
        "en": "Do you like tacos?"
      },
      {
        "before": "Mara tiene",
        "after": ".",
        "choices": [
          "gusta",
          "hambre",
          "gustan"
        ],
        "answer": 1,
        "en": "Mara is hungry."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "diego",
            "es": "¡Hola! ¿Tienes hambre?"
          }
        ],
        "choices": [
          "Tengo sed.",
          "Sí, tengo hambre.",
          "Me gusta el café."
        ],
        "answer": 1
      }
    ],
    "reads": [
      {
        "passage": "A Mara le gusta la paella. A Diego le encantan los tacos. Hoy tienen hambre y van a un restaurante.",
        "question": "What does Diego love?",
        "choices": [
          "Paella",
          "Tacos",
          "Coffee"
        ],
        "answer": 1
      },
      {
        "passage": "Rosa tiene sed. En la mesa hay agua y café. A Rosa le gusta el café, pero hoy quiere agua.",
        "question": "What does Rosa want today?",
        "choices": [
          "Coffee",
          "Water",
          "Fruit"
        ],
        "answer": 1
      }
    ]
  },
  {
    topics: [
      { id: "polite_requests_quisiera_me_", match: /Polite Requests: Quisiera, Me Da, Me Trae/i },
      { id: "cognates_for_food_and_restau", match: /Cognates for Food and Restaurant Words/i },
      { id: "ordering_in_a_restaurant", match: /Ordering in a Restaurant/i },
      { id: "reading_a_menu", match: /Reading a Menu/i },
    ],
    "unit": "Unit 4.6",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can order politely in a restaurant and read a simple menu.",
    "phrases": [
      {
        "id": "g4u6_quisiera_una_sopa_por_favor",
        "es": "Quisiera una sopa, por favor.",
        "en": [
          "I would like a soup, please.",
          "I'd like a soup, please."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "polite_requests_quisiera_me_"
      },
      {
        "id": "g4u6_me_trae_un_cafe_por_favor",
        "es": "¿Me trae un café, por favor?",
        "en": [
          "Could I have a coffee, please?",
          "Can you bring me a coffee, please?",
          "A coffee for me, please."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "polite_requests_quisiera_me_"
      },
      {
        "id": "g4u6_me_trae_la_cuenta",
        "es": "¿Me trae la cuenta?",
        "en": [
          "Could you bring me the bill?",
          "Can you bring me the check?",
          "Could you bring me the check?"
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "polite_requests_quisiera_me_"
      },
      {
        "id": "g4u6_puede_traerme_agua_por_favor",
        "es": "¿Puede traerme agua, por favor?",
        "en": [
          "Could you bring me water, please?",
          "Can you bring me some water, please?"
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "polite_requests_quisiera_me_"
      },
      {
        "id": "g4u6_el_menu",
        "es": "el menú",
        "en": [
          "the menu"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "cognates_for_food_and_restau"
      },
      {
        "id": "g4u6_el_restaurante",
        "es": "el restaurante",
        "en": [
          "the restaurant"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "cognates_for_food_and_restau"
      },
      {
        "id": "g4u6_la_ensalada",
        "es": "la ensalada",
        "en": [
          "the salad",
          "salad"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "cognates_for_food_and_restau"
      },
      {
        "id": "g4u6_el_plato_vegetariano",
        "es": "el plato vegetariano",
        "en": [
          "the vegetarian dish",
          "the vegetarian plate"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "cognates_for_food_and_restau"
      },
      {
        "id": "g4u6_que_desea",
        "es": "¿Qué desea?",
        "en": [
          "What would you like?",
          "What would you like to have?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "ordering_in_a_restaurant"
      },
      {
        "id": "g4u6_para_mi_la_sopa",
        "es": "Para mí, la sopa.",
        "en": [
          "The soup for me.",
          "For me, the soup."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "ordering_in_a_restaurant"
      },
      {
        "id": "g4u6_la_cuenta_por_favor",
        "es": "La cuenta, por favor.",
        "en": [
          "The bill, please.",
          "The check, please."
        ],
        "tier": 1,
        "skill": "es_greetings",
        "topic": "ordering_in_a_restaurant"
      },
      {
        "id": "g4u6_que_lleva_el_plato",
        "es": "¿Qué lleva el plato?",
        "en": [
          "What does the dish have in it?",
          "What's in the dish?",
          "What does the dish come with?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "ordering_in_a_restaurant"
      },
      {
        "id": "g4u6_las_entradas",
        "es": "las entradas",
        "en": [
          "the starters",
          "the appetizers"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "reading_a_menu"
      },
      {
        "id": "g4u6_el_plato_principal",
        "es": "el plato principal",
        "en": [
          "the main course",
          "the main dish"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "reading_a_menu"
      },
      {
        "id": "g4u6_los_postres",
        "es": "los postres",
        "en": [
          "the desserts",
          "desserts"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "reading_a_menu"
      },
      {
        "id": "g4u6_el_especial_del_dia",
        "es": "el especial del día",
        "en": [
          "the special of the day",
          "today's special"
        ],
        "tier": 3,
        "skill": "es_vocab_core",
        "topic": "reading_a_menu"
      }
    ],
    "scene": {
      "title": "En el restaurante",
      "art": "mesa",
      "lines": [
        {
          "who": "narrator",
          "es": "Es un restaurante pequeño. Mara y Diego tienen hambre.",
          "en": "It is a small restaurant. Mara and Diego are hungry.",
          "art": "mesa"
        },
        {
          "who": "rosa",
          "es": "¡Buenas tardes! ¿Qué desea?",
          "en": "Good afternoon! What would you like?"
        },
        {
          "who": "mara",
          "es": "Quisiera una sopa, por favor. ¿Qué lleva la sopa?",
          "en": "I would like a soup, please. What's in the soup?"
        },
        {
          "who": "rosa",
          "es": "La sopa lleva pollo y verduras. También hay ensalada.",
          "en": "The soup has chicken and vegetables. There is also salad."
        },
        {
          "who": "diego",
          "es": "Para mí, el plato vegetariano.",
          "en": "The vegetarian dish for me."
        },
        {
          "who": "rosa",
          "es": "Muy bien. ¿Para beber?",
          "en": "Very good. And to drink?"
        },
        {
          "who": "mara",
          "es": "¿Me trae un café, por favor?",
          "en": "Could I have a coffee, please?"
        },
        {
          "who": "diego",
          "es": "¿Me trae la cuenta, por favor?",
          "en": "Could you bring me the bill, please?"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Rosa ask the customers?",
          "choices": [
            "Where they live",
            "What they would like",
            "What time it is"
          ],
          "answer": 1
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "What is in the soup?",
          "choices": [
            "Only rice",
            "Fish and salad",
            "Chicken and vegetables"
          ],
          "answer": 2
        },
        {
          "after": 8,
          "kind": "read_respond",
          "question": "What does Diego ask for?",
          "choices": [
            "The bill",
            "A menu",
            "A dessert"
          ],
          "answer": 0
        }
      ]
    },
    "convo": null,
    "fills": [
      {
        "before": "Quisiera una",
        "after": ", por favor.",
        "choices": [
          "sopa",
          "mesa",
          "cuenta"
        ],
        "answer": 0,
        "en": "I would like a soup, please."
      },
      {
        "before": "¿Me",
        "after": "un café, por favor?",
        "choices": [
          "trae",
          "doy",
          "traigo"
        ],
        "answer": 0,
        "en": "Could I have a coffee, please."
      },
      {
        "before": "¿Me trae la",
        "after": "?",
        "choices": [
          "cuenta",
          "ensalada",
          "postre"
        ],
        "answer": 0,
        "en": "Could you bring me the bill?"
      },
      {
        "before": "Los",
        "after": "son dulces.",
        "choices": [
          "postres",
          "entradas",
          "bebidas"
        ],
        "answer": 0,
        "en": "The desserts are sweet."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Qué desea?"
          }
        ],
        "choices": [
          "Quisiera una ensalada, por favor.",
          "Me gusta la sopa.",
          "El restaurante es grande."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Algo más?"
          }
        ],
        "choices": [
          "Sí, la sopa está fría.",
          "No, gracias. La cuenta, por favor.",
          "Buenas noches, hasta mañana."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "El especial del día es sopa de verduras."
          }
        ],
        "choices": [
          "Sí, el restaurante es grande.",
          "No, el café es pequeño.",
          "¡Perfecto! Quisiera el especial, por favor."
        ],
        "answer": 2
      }
    ],
    "reads": [
      {
        "passage": "En el restaurante hay un menú. Las entradas son ensaladas. El plato principal es sopa. Los postres son fruta. El especial del día es sopa de verduras.",
        "question": "What is the special of the day?",
        "choices": [
          "Salad",
          "Vegetable soup",
          "Fruit"
        ],
        "answer": 1
      },
      {
        "passage": "Mara está en un restaurante. Dice: «Quisiera una ensalada, por favor. Me da un café.» Después dice: «¿Me trae la cuenta?»",
        "question": "What does Mara ask for at the end?",
        "choices": [
          "The bill",
          "A salad",
          "A coffee"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "paying_tipping_and_restauran", match: /Paying, Tipping, and Restaurant Customs/i },
      { id: "paying_by_cash_card_and_app_", match: /Paying by Cash, Card, and App at Checkout/i },
      { id: "numbers_100_to_1000_and_year", match: /Numbers 100 to 1000 and Years/i },
      { id: "prices_and_money", match: /Prices and Money/i },
    ],
    "unit": "Unit 4.7",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can pay at a checkout and understand prices, large numbers up to 1000, and years.",
    "phrases": [
      {
        "id": "g4u7_cuanto_cuesta",
        "es": "¿Cuánto cuesta?",
        "en": [
          "How much does it cost?",
          "How much is it?"
        ],
        "alt": [
          "¿Cuánto vale?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "prices_and_money"
      },
      {
        "id": "g4u7_son_doscientos_cincuenta_pes",
        "es": "Son doscientos cincuenta pesos.",
        "en": [
          "It's two hundred fifty pesos.",
          "It is 250 pesos."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "numbers_100_to_1000_and_year"
      },
      {
        "id": "g4u7_puedo_pagar_con_tarjeta",
        "es": "¿Puedo pagar con tarjeta?",
        "en": [
          "Can I pay by card?",
          "May I pay with a card?",
          "Can I pay with card?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "paying_by_cash_card_and_app_"
      },
      {
        "id": "g4u7_cien_pesos_por_favor",
        "es": "Cien pesos, por favor.",
        "en": [
          "One hundred pesos, please.",
          "A hundred pesos, please."
        ],
        "tier": 1,
        "skill": "es_numbers",
        "topic": "numbers_100_to_1000_and_year"
      },
      {
        "id": "g4u7_son_quinientos_pesos",
        "es": "Son quinientos pesos.",
        "en": [
          "It's five hundred pesos.",
          "That's five hundred pesos."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "numbers_100_to_1000_and_year"
      },
      {
        "id": "g4u7_es_barato",
        "es": "Es barato.",
        "en": [
          "It's cheap.",
          "It is inexpensive."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "prices_and_money"
      },
      {
        "id": "g4u7_es_caro",
        "es": "Es caro.",
        "en": [
          "It's expensive.",
          "It is expensive."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "prices_and_money"
      },
      {
        "id": "g4u7_aceptan_tarjeta",
        "es": "¿Aceptan tarjeta?",
        "en": [
          "Do you accept cards?",
          "Do you take cards?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "prices_and_money"
      },
      {
        "id": "g4u7_efectivo_o_tarjeta",
        "es": "¿Efectivo o tarjeta?",
        "en": [
          "Cash or card?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "paying_by_cash_card_and_app_"
      },
      {
        "id": "g4u7_me_da_el_recibo",
        "es": "¿Me da el recibo?",
        "en": [
          "Can you give me the receipt?",
          "Could you give me the receipt?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "paying_by_cash_card_and_app_"
      },
      {
        "id": "g4u7_pago_con_el_celular",
        "es": "Pago con el celular.",
        "en": [
          "I'm paying with my phone.",
          "I pay with my phone.",
          "I'll pay with my phone."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "paying_by_cash_card_and_app_"
      },
      {
        "id": "g4u7_la_propina_esta_incluida",
        "es": "La propina está incluida.",
        "en": [
          "The tip is included."
        ],
        "alt": [
          "La propina está incluida en la cuenta."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "paying_tipping_and_restauran"
      },
      {
        "id": "g4u7_vamos_a_dividir_la_cuenta",
        "es": "Vamos a dividir la cuenta.",
        "en": [
          "We're going to split the bill.",
          "Let's split the bill."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "paying_tipping_and_restauran"
      },
      {
        "id": "g4u7_la_cuenta_por_favor",
        "es": "La cuenta, por favor.",
        "en": [
          "The bill, please.",
          "The check, please."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "paying_tipping_and_restauran"
      },
      {
        "id": "g4u7_dejamos_propina",
        "es": "¿Dejamos propina?",
        "en": [
          "Do we leave a tip?",
          "Shall we leave a tip?"
        ],
        "tier": 3,
        "skill": "es_present_ar",
        "topic": "paying_tipping_and_restauran"
      }
    ],
    "scene": {
      "title": "En la caja del café",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Es sábado por la tarde en el café de Rosa.",
          "en": "It's Saturday afternoon at Rosa's café.",
          "art": "cafe"
        },
        {
          "who": "diego",
          "es": "Buenas tardes. ¿Cuánto cuesta el café con pan?",
          "en": "Good afternoon. How much is coffee with bread?"
        },
        {
          "who": "rosa",
          "es": "Son doscientos cincuenta pesos.",
          "en": "It's two hundred fifty pesos."
        },
        {
          "who": "diego",
          "es": "Es un poco caro. ¿Aceptan tarjeta?",
          "en": "It's a bit expensive. Do you accept cards?"
        },
        {
          "who": "rosa",
          "es": "Sí. ¿Efectivo o tarjeta?",
          "en": "Yes. Cash or card?"
        },
        {
          "who": "diego",
          "es": "Pago con el celular. ¿Me da el recibo?",
          "en": "I'm paying with my phone. Can you give me the receipt?"
        },
        {
          "who": "rosa",
          "es": "Claro, aquí tiene. La propina está incluida.",
          "en": "Of course, here you go. The tip is included."
        },
        {
          "who": "diego",
          "es": "Perfecto. ¡Hasta luego!",
          "en": "Perfect. See you later!"
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Diego ask about?",
          "choices": [
            "The receipt",
            "The price of coffee with bread",
            "The tip"
          ],
          "answer": 1
        },
        {
          "after": 3,
          "kind": "read_respond",
          "question": "How much is the coffee with bread?",
          "choices": [
            "500 pesos",
            "250 pesos",
            "1990 pesos"
          ],
          "answer": 1
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What does Rosa say about the tip?",
          "choices": [
            "That it is not included",
            "That it costs two hundred pesos",
            "That it is included"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "The checkout of a small shop, with three items on the counter.",
      "learnerCard": "You are a customer with three items and 300 pesos in cash. Pay at the checkout.",
      "learnerCardEs": "Tienes tres cosas y trescientos pesos en efectivo. Paga en la caja.",
      "partnerCard": "Cashier who knows the prices and the payment options.",
      "goals": [
        {
          "id": "ask_price",
          "text": "Ask how much an item costs (¿Cuánto cuesta?)"
        },
        {
          "id": "ask_card",
          "text": "Ask if they accept cards (¿Aceptan tarjeta?)"
        },
        {
          "id": "pay_cash",
          "text": "Say you pay in cash (Pago en efectivo.)"
        },
        {
          "id": "ask_receipt",
          "text": "Ask for the receipt (¿Me da el recibo?)"
        }
      ],
      "targets": [
        "¿Cuánto cuesta?",
        "Son doscientos cincuenta pesos.",
        "¿Aceptan tarjeta?",
        "Pago en efectivo.",
        "¿Me da el recibo?"
      ],
      "opening": "¡Buenas tardes! Bienvenido a la tienda.",
      "script": [
        {
          "goal": "ask_price",
          "expect": [
            "cuanto",
            "cuesta"
          ],
          "reply": "El pan cuesta doscientos cincuenta pesos.",
          "hint": "Say \"¿Cuánto cuesta el pan?\""
        },
        {
          "goal": "ask_card",
          "expect": [
            "aceptan",
            "tarjeta"
          ],
          "reply": "Sí, aceptamos tarjeta y efectivo.",
          "hint": "Say \"¿Aceptan tarjeta?\""
        },
        {
          "goal": "pay_cash",
          "expect": [
            "pago",
            "efectivo"
          ],
          "reply": "Perfecto. Son doscientos cincuenta pesos.",
          "hint": "Say \"Pago en efectivo.\""
        },
        {
          "goal": "ask_receipt",
          "expect": [
            "me",
            "da",
            "recibo"
          ],
          "reply": "Claro, aquí tiene su recibo. ¡Gracias!",
          "hint": "Say \"¿Me da el recibo?\""
        }
      ],
      "nudges": {
        "ask_price": "Pregunta: «¿Cuánto cuesta?»",
        "ask_card": "Pregunta: «¿Aceptan tarjeta?»",
        "pay_cash": "Di: «Pago en efectivo.»",
        "ask_receipt": "Pide: «¿Me da el recibo?»"
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Gracias! ¡Hasta luego!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "¿Cuánto",
        "after": "el pan?",
        "choices": [
          "cuestan",
          "cuesta",
          "cuestas"
        ],
        "answer": 1,
        "en": "How much does the bread cost?"
      },
      {
        "before": "Son doscientos",
        "after": "pesos.",
        "choices": [
          "cincuenta",
          "cinco",
          "ciento"
        ],
        "answer": 0,
        "en": "It's two hundred fifty pesos."
      },
      {
        "before": "¿Me da el",
        "after": "?",
        "choices": [
          "recibo",
          "tarjeta",
          "efectivo"
        ],
        "answer": 0,
        "en": "Can you give me the receipt?"
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Efectivo o tarjeta?"
          }
        ],
        "choices": [
          "Con tarjeta, por favor.",
          "Son doscientos pesos.",
          "La propina está incluida."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "Son quinientos pesos."
          }
        ],
        "choices": [
          "Aquí tiene.",
          "Es barato.",
          "¿Cuánto cuesta?"
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "rosa",
            "es": "Aquí tiene su recibo."
          }
        ],
        "choices": [
          "Gracias. ¿La propina está incluida?",
          "Son doscientos pesos.",
          "Pago con el celular."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "El café con pan cuesta doscientos cincuenta pesos. Diego paga con el celular. La propina está incluida.",
        "question": "How much does the coffee with bread cost?",
        "choices": [
          "250 pesos",
          "500 pesos",
          "1990 pesos"
        ],
        "answer": 0
      },
      {
        "passage": "Mara compra un libro. El libro cuesta quinientos pesos. Mara dice: «Es caro». Paga en efectivo y pide el recibo.",
        "question": "How does Mara pay?",
        "choices": [
          "By card",
          "In cash",
          "With her phone"
        ],
        "answer": 1
      }
    ]
  },
  {
    topics: [
      { id: "colors_and_how_they_agree", match: /Colors and How They Agree/i },
      { id: "clothing_and_wearing_it", match: /Clothing and Wearing It/i },
      { id: "sizes_fit_and_trying_things_", match: /Sizes, Fit, and Trying Things On/i },
      { id: "size_words_enorme_diminuto_g", match: /Size Words: Enorme, Diminuto, Gigante, Pequeñito, and Regular/i },
    ],
    "unit": "Unit 4.8",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can describe colors and clothing, and ask for sizes and try things on in a shop.",
    "phrases": [
      {
        "id": "g4u8_una_camisa_azul",
        "es": "una camisa azul",
        "en": [
          "a blue shirt"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "colors_and_how_they_agree"
      },
      {
        "id": "g4u8_los_zapatos_negros",
        "es": "los zapatos negros",
        "en": [
          "the black shoes"
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "colors_and_how_they_agree"
      },
      {
        "id": "g4u8_una_chaqueta_roja",
        "es": "una chaqueta roja",
        "en": [
          "a red jacket"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "colors_and_how_they_agree"
      },
      {
        "id": "g4u8_la_camiseta_naranja",
        "es": "la camiseta naranja",
        "en": [
          "the orange T-shirt"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "colors_and_how_they_agree"
      },
      {
        "id": "g4u8_los_pantalones",
        "es": "los pantalones",
        "en": [
          "the pants",
          "the trousers"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "clothing_and_wearing_it"
      },
      {
        "id": "g4u8_llevo_un_vestido",
        "es": "Llevo un vestido.",
        "en": [
          "I'm wearing a dress.",
          "I am wearing a dress."
        ],
        "alt": [
          "Yo llevo un vestido."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "clothing_and_wearing_it"
      },
      {
        "id": "g4u8_llevo_zapatos_nuevos",
        "es": "Llevo zapatos nuevos.",
        "en": [
          "I'm wearing new shoes.",
          "I wear new shoes."
        ],
        "alt": [
          "Yo llevo zapatos nuevos."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "clothing_and_wearing_it"
      },
      {
        "id": "g4u8_uso_talla_mediana",
        "es": "Uso talla mediana.",
        "en": [
          "I wear a medium size.",
          "I'm a medium."
        ],
        "alt": [
          "Yo uso talla mediana.",
          "Uso la talla mediana."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "sizes_fit_and_trying_things_"
      },
      {
        "id": "g4u8_puedo_probarmelo",
        "es": "¿Puedo probármelo?",
        "en": [
          "Can I try it on?",
          "May I try it on?"
        ],
        "alt": [
          "¿Me lo puedo probar?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "sizes_fit_and_trying_things_"
      },
      {
        "id": "g4u8_me_queda_grande",
        "es": "Me queda grande.",
        "en": [
          "It's too big for me.",
          "It is too big on me."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "sizes_fit_and_trying_things_"
      },
      {
        "id": "g4u8_tiene_en_otro_color",
        "es": "¿Tiene en otro color?",
        "en": [
          "Do you have it in another color?",
          "Do you have it in a different color?"
        ],
        "alt": [
          "¿Lo tiene en otro color?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "sizes_fit_and_trying_things_"
      },
      {
        "id": "g4u8_el_sueter_enorme",
        "es": "el suéter enorme",
        "en": [
          "the huge sweater",
          "the enormous sweater"
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "size_words_enorme_diminuto_g"
      },
      {
        "id": "g4u8_los_zapatos_son_diminutos",
        "es": "Los zapatos son diminutos.",
        "en": [
          "The shoes are tiny.",
          "The shoes are very small."
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "size_words_enorme_diminuto_g"
      },
      {
        "id": "g4u8_un_perro_pequenito",
        "es": "un perro pequeñito",
        "en": [
          "a tiny dog",
          "a little dog"
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "size_words_enorme_diminuto_g"
      },
      {
        "id": "g4u8_una_camiseta_gigante",
        "es": "una camiseta gigante",
        "en": [
          "a giant T-shirt",
          "a huge T-shirt"
        ],
        "tier": 3,
        "skill": "es_adjectives",
        "topic": "size_words_enorme_diminuto_g"
      },
      {
        "id": "g4u8_una_talla_regular",
        "es": "una talla regular",
        "en": [
          "a regular size"
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "size_words_enorme_diminuto_g"
      }
    ],
    "scene": {
      "title": "En la tienda de ropa",
      "art": "casa",
      "lines": [
        {
          "who": "narrator",
          "es": "Es sábado. Mara y Tomás están en una tienda de ropa.",
          "en": "It's Saturday. Mara and Tomás are in a clothing store.",
          "art": "casa"
        },
        {
          "who": "rosa",
          "es": "¡Hola! ¿Buscan una camisa?",
          "en": "Hi! Are you looking for a shirt?"
        },
        {
          "who": "mara",
          "es": "Sí, una camisa azul. Uso talla mediana.",
          "en": "Yes, a blue shirt. I wear a medium size."
        },
        {
          "who": "rosa",
          "es": "Aquí tienes. ¿Te gusta?",
          "en": "Here you go. Do you like it?"
        },
        {
          "who": "mara",
          "es": "¿Puedo probármela?",
          "en": "Can I try it on?"
        },
        {
          "who": "rosa",
          "es": "Claro. El probador está allí.",
          "en": "Of course. The fitting room is there."
        },
        {
          "who": "mara",
          "es": "Me queda grande. ¿Tiene talla pequeña?",
          "en": "It's too big for me. Do you have a small size?"
        },
        {
          "who": "rosa",
          "es": "Sí, aquí tiene. También hay una camiseta naranja.",
          "en": "Yes, here you go. There's also an orange T-shirt."
        }
      ],
      "questions": [
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What size does Mara wear?",
          "choices": [
            "Medium",
            "Small",
            "Large"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "What does Mara ask to do?",
          "choices": [
            "Try on the shirt",
            "Buy the jacket",
            "See another color"
          ],
          "answer": 0
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "How does the shirt fit Mara?",
          "choices": [
            "It's too big",
            "It's too small",
            "It's just right"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "rosa",
      "partnerName": "Rosa",
      "setting": "a clothing store",
      "learnerCard": "You are shopping for a shirt. You know your size and preferred colors.",
      "learnerCardEs": "Buscas una camisa azul y sabes tu talla.",
      "partnerCard": "You are a store clerk. You know the stock and sizes.",
      "goals": [
        {
          "id": "pedir_color",
          "text": "Ask for a blue shirt (una camisa azul)."
        },
        {
          "id": "decir_talla",
          "text": "Say your size (Uso talla mediana)."
        },
        {
          "id": "probar",
          "text": "Ask to try it on (¿Puedo probármelo?)."
        },
        {
          "id": "decir_queda",
          "text": "Say it's too big (Me queda grande)."
        }
      ],
      "targets": [
        "una camisa azul",
        "Uso talla mediana",
        "¿Puedo probármelo?",
        "Me queda grande",
        "¿Tiene en otro color?"
      ],
      "opening": "¡Hola! ¿Qué busca hoy?",
      "script": [
        {
          "goal": "pedir_color",
          "expect": [
            "camisa",
            "azul"
          ],
          "reply": "Sí, tenemos una camisa azul. ¿Qué talla usa?",
          "hint": "Say \"Busco una camisa azul.\""
        },
        {
          "goal": "decir_talla",
          "expect": [
            "talla",
            "mediana"
          ],
          "reply": "Perfecto. Aquí tiene una talla mediana.",
          "hint": "Say \"Uso talla mediana.\""
        },
        {
          "goal": "probar",
          "expect": [
            "puedo",
            "probar"
          ],
          "reply": "Claro, puede probárselo. El probador está allí.",
          "hint": "Say \"¿Puedo probármelo?\""
        },
        {
          "goal": "decir_queda",
          "expect": [
            "queda",
            "grande"
          ],
          "reply": "¿Quiere una talla pequeña o otro color?",
          "hint": "Say \"Me queda grande.\""
        }
      ],
      "nudges": {
        "pedir_color": "Di: Busco una camisa azul.",
        "decir_talla": "Di: Uso talla mediana.",
        "probar": "Di: ¿Puedo probármelo?",
        "decir_queda": "Di: Me queda grande."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Gracias! ¡Que tenga un buen día!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "una camisa",
        "after": ".",
        "choices": [
          "azul",
          "azules",
          "azula"
        ],
        "answer": 0,
        "en": "a blue shirt"
      },
      {
        "before": "Uso talla",
        "after": ".",
        "choices": [
          "mediana",
          "mediano",
          "medianas"
        ],
        "answer": 0,
        "en": "I wear a medium size."
      },
      {
        "before": "Me",
        "after": "grande.",
        "choices": [
          "queda",
          "quedo",
          "quedan"
        ],
        "answer": 0,
        "en": "It's too big for me."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¡Hola! ¿Qué talla usa?"
          }
        ],
        "choices": [
          "Uso talla mediana.",
          "Me queda grande.",
          "Son zapatos negros."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Te gusta la camisa azul?"
          }
        ],
        "choices": [
          "Sí, me gusta mucho.",
          "Sí, uso talla mediana.",
          "No, es una chaqueta."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Puedo probármelo?"
          }
        ],
        "choices": [
          "Claro, el probador está allí.",
          "Me queda grande.",
          "Uso talla mediana."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara usa talla mediana. Busca una camisa azul en la tienda. La camisa le queda grande y pide una talla pequeña.",
        "question": "What happens with the blue shirt?",
        "choices": [
          "It's too big for Mara.",
          "It's too small for Mara.",
          "Mara doesn't like the color."
        ],
        "answer": 0
      },
      {
        "passage": "Tomás lleva una chaqueta roja y zapatos negros. En la tienda ve una camiseta naranja. La camiseta es gigante, pero a Tomás le gusta.",
        "question": "What color is Tomás's jacket?",
        "choices": [
          "Red",
          "Black",
          "Orange"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "demonstratives_este_ese_aque", match: /Demonstratives: Este, Ese, Aquel/i },
      { id: "muy_mucho_poco_bastante_dema", match: /Muy, Mucho, Poco, Bastante, Demasiado/i },
      { id: "shops_and_stores", match: /Shops and Stores/i },
      { id: "quantities_weights_and_conta", match: /Quantities, Weights, and Containers/i },
      { id: "approximate_amounts_unos_com", match: /Approximate Amounts: Unos, Como, Cerca de, Más o Menos/i },
    ],
    "unit": "Unit 4.9",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can use demonstratives and quantity words, name shops and containers, and give approximate amounts.",
    "phrases": [
      {
        "id": "g4u9_este_pan_es_fresco",
        "es": "Este pan es fresco.",
        "en": [
          "This bread is fresh.",
          "This bread is fresh."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "demonstratives_este_ese_aque"
      },
      {
        "id": "g4u9_ese_libro_es_caro",
        "es": "Ese libro es caro.",
        "en": [
          "That book is expensive.",
          "That book's expensive."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "demonstratives_este_ese_aque"
      },
      {
        "id": "g4u9_aquella_tienda_es_grande",
        "es": "Aquella tienda es grande.",
        "en": [
          "That shop over there is big.",
          "That store over there is big."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "demonstratives_este_ese_aque"
      },
      {
        "id": "g4u9_es_muy_caro",
        "es": "Es muy caro.",
        "en": [
          "It's very expensive.",
          "It is very expensive."
        ],
        "tier": 1,
        "skill": "es_adjectives",
        "topic": "muy_mucho_poco_bastante_dema"
      },
      {
        "id": "g4u9_hay_mucha_fruta",
        "es": "Hay mucha fruta.",
        "en": [
          "There is a lot of fruit.",
          "There's lots of fruit.",
          "There is plenty of fruit."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "muy_mucho_poco_bastante_dema"
      },
      {
        "id": "g4u9_tengo_poco_dinero",
        "es": "Tengo poco dinero.",
        "en": [
          "I have little money.",
          "I don't have much money."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "muy_mucho_poco_bastante_dema"
      },
      {
        "id": "g4u9_es_bastante_bueno",
        "es": "Es bastante bueno.",
        "en": [
          "It's quite good.",
          "It is pretty good."
        ],
        "tier": 2,
        "skill": "es_adjectives",
        "topic": "muy_mucho_poco_bastante_dema"
      },
      {
        "id": "g4u9_la_panaderia_vende_pan",
        "es": "La panadería vende pan.",
        "en": [
          "The bakery sells bread."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "shops_and_stores"
      },
      {
        "id": "g4u9_la_carniceria_vende_carne",
        "es": "La carnicería vende carne.",
        "en": [
          "The butcher shop sells meat.",
          "The butcher's shop sells meat."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "shops_and_stores"
      },
      {
        "id": "g4u9_la_farmacia_esta_cerca",
        "es": "La farmacia está cerca.",
        "en": [
          "The pharmacy is nearby.",
          "The drugstore is close."
        ],
        "tier": 2,
        "skill": "es_ser_estar",
        "topic": "shops_and_stores"
      },
      {
        "id": "g4u9_un_kilo_de_manzanas_por_favo",
        "es": "Un kilo de manzanas, por favor.",
        "en": [
          "A kilo of apples, please.",
          "One kilo of apples, please."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "quantities_weights_and_conta"
      },
      {
        "id": "g4u9_una_botella_de_agua_por_favo",
        "es": "Una botella de agua, por favor.",
        "en": [
          "A bottle of water, please.",
          "One bottle of water, please."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "quantities_weights_and_conta"
      },
      {
        "id": "g4u9_una_docena_de_huevos",
        "es": "Una docena de huevos.",
        "en": [
          "A dozen eggs.",
          "One dozen eggs."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "quantities_weights_and_conta"
      },
      {
        "id": "g4u9_mas_o_menos",
        "es": "Más o menos.",
        "en": [
          "More or less.",
          "About that.",
          "So-so."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "approximate_amounts_unos_com"
      },
      {
        "id": "g4u9_unos_veinte_pesos",
        "es": "Unos veinte pesos.",
        "en": [
          "About twenty pesos.",
          "Some twenty pesos."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "approximate_amounts_unos_com"
      },
      {
        "id": "g4u9_hay_como_diez_manzanas",
        "es": "Hay como diez manzanas.",
        "en": [
          "There are about ten apples.",
          "There are around ten apples."
        ],
        "tier": 3,
        "skill": "es_numbers",
        "topic": "approximate_amounts_unos_com"
      }
    ],
    "scene": {
      "title": "En el mercado",
      "art": "pan",
      "lines": [
        {
          "who": "narrator",
          "es": "Es sábado por la mañana en el mercado.",
          "en": "It's Saturday morning at the market.",
          "art": "pan"
        },
        {
          "who": "rosa",
          "es": "¡Mira, Tomás! Esta panadería vende pan fresco.",
          "en": "Look, Tomás! This bakery sells fresh bread."
        },
        {
          "who": "tomas",
          "es": "Sí, pero ese pan es muy caro.",
          "en": "Yes, but that bread is very expensive."
        },
        {
          "who": "diego",
          "es": "Buenos días. ¿Qué desea?",
          "en": "Good morning. What would you like?"
        },
        {
          "who": "rosa",
          "es": "Un kilo de manzanas, por favor.",
          "en": "A kilo of apples, please."
        },
        {
          "who": "diego",
          "es": "Muy bien. ¿Algo más?",
          "en": "Very good. Anything else?"
        },
        {
          "who": "mara",
          "es": "Sí, una botella de agua y una docena de huevos.",
          "en": "Yes, a bottle of water and a dozen eggs."
        },
        {
          "who": "diego",
          "es": "Son unos veinte pesos, más o menos.",
          "en": "That's about twenty pesos, more or less."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does the bakery sell?",
          "choices": [
            "Fresh bread",
            "Water",
            "Eggs"
          ],
          "answer": 0
        },
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What does Tomás say about that bread?",
          "choices": [
            "It's very expensive",
            "It's very fresh",
            "It's cold"
          ],
          "answer": 0
        },
        {
          "after": 8,
          "kind": "read_respond",
          "question": "How much is everything?",
          "choices": [
            "About twenty pesos",
            "Exactly fifty pesos",
            "Nothing"
          ],
          "answer": 0
        }
      ]
    },
    "convo": {
      "partner": "diego",
      "partnerName": "Diego",
      "setting": "A market stall full of fresh fruit and other goods.",
      "learnerCard": "You are shopping at Diego's market stall. Ask for goods in different amounts and give an approximate total.",
      "learnerCardEs": "Compras en el mercado. Pide fruta y otras cosas en cantidades.",
      "partnerCard": "Diego is a friendly market vendor. He knows what is fresh today and helps you choose.",
      "goals": [
        {
          "id": "g1",
          "text": "Ask for a kilo of something (Un kilo de…)"
        },
        {
          "id": "g2",
          "text": "Ask for a bottle or a dozen (Una botella de… / Una docena de…)"
        },
        {
          "id": "g3",
          "text": "Give an approximate amount (unos / más o menos)"
        },
        {
          "id": "g4",
          "text": "Say thanks and say goodbye (Gracias / Adiós)"
        }
      ],
      "targets": [
        "Un kilo de manzanas, por favor.",
        "Una botella de agua, por favor.",
        "Una docena de huevos.",
        "Unos veinte pesos.",
        "Más o menos."
      ],
      "opening": "¡Buenos días! ¿Qué desea hoy?",
      "script": [
        {
          "goal": "g1",
          "expect": [
            "kilo",
            "manzana",
            "favor"
          ],
          "reply": "Muy bien, un kilo de manzanas. Están muy frescas.",
          "hint": "Say \"Un kilo de manzanas, por favor.\""
        },
        {
          "goal": "g2",
          "expect": [
            "botella",
            "docena",
            "agua",
            "huevo"
          ],
          "reply": "Aquí tiene. ¿Algo más?",
          "hint": "Say \"Una botella de agua, por favor.\""
        },
        {
          "goal": "g3",
          "expect": [
            "unos",
            "mas o menos",
            "como",
            "pesos"
          ],
          "reply": "Sí, son unos veinte pesos.",
          "hint": "Say \"Unos veinte pesos, más o menos.\""
        },
        {
          "goal": "g4",
          "expect": [
            "gracias",
            "adios",
            "hasta",
            "luego"
          ],
          "reply": "¡Gracias a usted! ¡Hasta pronto!",
          "hint": "Say \"Gracias. ¡Adiós!\""
        }
      ],
      "nudges": {
        "g1": "Pide un kilo: «Un kilo de…»",
        "g2": "Pide una botella o una docena.",
        "g3": "Di una cantidad aproximada: «Unos…»",
        "g4": "Di «gracias» y «adiós»."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Hasta luego! ¡Vuelva pronto!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "Un",
        "after": "de manzanas, por favor.",
        "choices": [
          "kilo",
          "kilos",
          "botella"
        ],
        "answer": 0,
        "en": "A kilo of apples, please."
      },
      {
        "before": "Tengo",
        "after": "dinero.",
        "choices": [
          "poco",
          "poca",
          "pocos"
        ],
        "answer": 0,
        "en": "I have little money."
      },
      {
        "before": "Son",
        "after": "veinte pesos.",
        "choices": [
          "unos",
          "una",
          "un"
        ],
        "answer": 0,
        "en": "They're about twenty pesos."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Vas a la panadería?"
          }
        ],
        "choices": [
          "Sí, necesito pan.",
          "Sí, necesito zapatos.",
          "No, voy a la carnicería."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Cuánto cuesta esta botella de agua?"
          }
        ],
        "choices": [
          "Cerca de diez pesos.",
          "La panadería vende pan.",
          "Soy de México."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "El kilo de manzanas es muy caro."
          }
        ],
        "choices": [
          "Sí, cuesta demasiado.",
          "No, el pan es barato.",
          "No, la zapatería está cerca."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "La zapatería vende zapatos. Los zapatos son bastante caros. Cuestan unos cien pesos.",
        "question": "How much do the shoes cost?",
        "choices": [
          "About a hundred pesos",
          "Exactly ten pesos",
          "Nothing"
        ],
        "answer": 0
      },
      {
        "passage": "En el supermercado, Rosa compra una botella de agua y una docena de huevos. Todo cuesta más o menos cincuenta pesos.",
        "question": "What does Rosa buy?",
        "choices": [
          "Water and eggs",
          "Bread and apples",
          "Shoes"
        ],
        "answer": 0
      }
    ]
  },
  {
    topics: [
      { id: "shopping_for_clothes_or_groc", match: /Role-Play: Shopping for Clothes or Groceries/i },
      { id: "a_five_minute_cafe_chat_abou", match: /Speaking: A Five-Minute Café Chat About Food and Plans/i },
      { id: "markets_bargaining_and_shopp", match: /Markets, Bargaining, and Shopping Culture/i },
      { id: "restaurant_and_store_announc", match: /Listening: Restaurant and Store Announcements/i },
      { id: "menus_ads_and_receipts", match: /Reading: Menus, Ads, and Receipts/i },
    ],
    "unit": "Unit 4.10",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can handle shopping and café conversations about food and plans and follow simple announcements.",
    "phrases": [
      {
        "id": "g4u10_busco_unos_zapatos",
        "es": "Busco unos zapatos.",
        "en": [
          "I'm looking for some shoes.",
          "I am looking for some shoes.",
          "I'm looking for a pair of shoes."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "shopping_for_clothes_or_groc"
      },
      {
        "id": "g4u10_cuanto_cuesta_la_camiseta",
        "es": "¿Cuánto cuesta la camiseta?",
        "en": [
          "How much is the T-shirt?",
          "How much does the T-shirt cost?"
        ],
        "tier": 1,
        "skill": "es_questions",
        "topic": "shopping_for_clothes_or_groc"
      },
      {
        "id": "g4u10_voy_a_comprar_fruta",
        "es": "Voy a comprar fruta.",
        "en": [
          "I'm going to buy fruit.",
          "I am going to buy fruit."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "shopping_for_clothes_or_groc"
      },
      {
        "id": "g4u10_que_quieres_tomar",
        "es": "¿Qué quieres tomar?",
        "en": [
          "What do you want to drink?",
          "What do you want to have?"
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "a_five_minute_cafe_chat_abou"
      },
      {
        "id": "g4u10_me_gusta_el_cafe_con_leche",
        "es": "Me gusta el café con leche.",
        "en": [
          "I like coffee with milk."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "a_five_minute_cafe_chat_abou"
      },
      {
        "id": "g4u10_quiero_un_jugo_de_naranja",
        "es": "Quiero un jugo de naranja.",
        "en": [
          "I want an orange juice.",
          "I'd like an orange juice."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "a_five_minute_cafe_chat_abou"
      },
      {
        "id": "g4u10_voy_a_ir_de_compras_el_sabad",
        "es": "Voy a ir de compras el sábado.",
        "en": [
          "I'm going to go shopping on Saturday.",
          "I am going to go shopping on Saturday."
        ],
        "tier": 2,
        "skill": "es_present_erir",
        "topic": "a_five_minute_cafe_chat_abou"
      },
      {
        "id": "g4u10_cual_es_el_precio_mas_bajo",
        "es": "¿Cuál es el precio más bajo?",
        "en": [
          "What's the lowest price?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "markets_bargaining_and_shopp"
      },
      {
        "id": "g4u10_es_muy_caro",
        "es": "Es muy caro.",
        "en": [
          "It's very expensive.",
          "It is very expensive."
        ],
        "tier": 1,
        "skill": "es_ser_estar",
        "topic": "markets_bargaining_and_shopp"
      },
      {
        "id": "g4u10_compro_manzanas_en_el_mercad",
        "es": "Compro manzanas en el mercado.",
        "en": [
          "I buy apples at the market.",
          "I'm buying apples at the market."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "markets_bargaining_and_shopp"
      },
      {
        "id": "g4u10_atencion_senores_clientes",
        "es": "Atención, señores clientes.",
        "en": [
          "Attention, customers.",
          "Attention, shoppers."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "restaurant_and_store_announc"
      },
      {
        "id": "g4u10_la_tienda_cierra_a_las_nueve",
        "es": "La tienda cierra a las nueve.",
        "en": [
          "The store closes at nine.",
          "The shop closes at nine o'clock."
        ],
        "tier": 2,
        "skill": "es_present_ar",
        "topic": "restaurant_and_store_announc"
      },
      {
        "id": "g4u10_hoy_hay_una_oferta_especial",
        "es": "Hoy hay una oferta especial.",
        "en": [
          "Today there's a special offer.",
          "Today there is a special deal."
        ],
        "tier": 2,
        "skill": "es_vocab_core",
        "topic": "restaurant_and_store_announc"
      },
      {
        "id": "g4u10_el_menu_del_dia_cuesta_ocho_",
        "es": "El menú del día cuesta ocho dólares.",
        "en": [
          "The menu of the day costs eight dollars.",
          "The daily menu costs eight dollars."
        ],
        "tier": 3,
        "skill": "es_numbers",
        "topic": "menus_ads_and_receipts"
      },
      {
        "id": "g4u10_abierto_de_nueve_a_seis",
        "es": "Abierto de nueve a seis.",
        "en": [
          "Open from nine to six.",
          "Open nine to six."
        ],
        "tier": 2,
        "skill": "es_numbers",
        "topic": "menus_ads_and_receipts"
      },
      {
        "id": "g4u10_el_recibo_dice_doce_pesos",
        "es": "El recibo dice doce pesos.",
        "en": [
          "The receipt says twelve pesos.",
          "The receipt says 12 pesos."
        ],
        "tier": 3,
        "skill": "es_present_erir",
        "topic": "menus_ads_and_receipts"
      }
    ],
    "scene": {
      "title": "En el café: planes de compras",
      "art": "cafe",
      "lines": [
        {
          "who": "narrator",
          "es": "Son las diez de la mañana. Mara y Tomás están en un café.",
          "en": "It's ten in the morning. Mara and Tomás are at a café.",
          "art": "cafe"
        },
        {
          "who": "mara",
          "es": "¡Hola, Tomás! ¿Qué quieres tomar?",
          "en": "Hi, Tomás! What do you want to drink?"
        },
        {
          "who": "tomas",
          "es": "Quiero un jugo de naranja. ¿Y tú?",
          "en": "I want an orange juice. And you?"
        },
        {
          "who": "mara",
          "es": "Me gusta el café con leche.",
          "en": "I like coffee with milk."
        },
        {
          "who": "tomas",
          "es": "Voy a ir de compras el sábado. ¿Vamos juntos?",
          "en": "I'm going to go shopping on Saturday. Shall we go together?"
        },
        {
          "who": "mara",
          "es": "¡Sí! Busco unos zapatos.",
          "en": "Yes! I'm looking for some shoes."
        },
        {
          "who": "tomas",
          "es": "Hoy hay una oferta especial. La tienda cierra a las nueve.",
          "en": "Today there's a special offer. The store closes at nine."
        },
        {
          "who": "mara",
          "es": "Perfecto. Voy a comprar fruta en el mercado y zapatos en la tienda.",
          "en": "Perfect. I'll buy fruit at the market and shoes at the store."
        }
      ],
      "questions": [
        {
          "after": 2,
          "kind": "read_respond",
          "question": "What does Mara ask Tomás?",
          "choices": [
            "What he wants to drink",
            "Where he lives",
            "How old he is"
          ],
          "answer": 0
        },
        {
          "after": 5,
          "kind": "read_respond",
          "question": "What is Tomás going to do on Saturday?",
          "choices": [
            "Go to school",
            "Go shopping",
            "Cook at home"
          ],
          "answer": 1
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "What time does the store close?",
          "choices": [
            "At six",
            "At ten",
            "At nine"
          ],
          "answer": 2
        }
      ]
    },
    "convo": {
      "partner": "tomas",
      "partnerName": "Tomás",
      "setting": "A café in the morning. You and Tomás are each holding a different schedule, and you plan a day of shopping together.",
      "learnerCard": "You meet Tomás at a café. Order something, say what you like, say what you're going to buy, and ask a price. Then plan a day of shopping.",
      "learnerCardEs": "Estás en el café con Tomás. Pide algo, di qué te gusta y planea un día de compras.",
      "partnerCard": "Tomás has a café and a free Saturday. He wants to go shopping with you and loves a good offer.",
      "goals": [
        {
          "id": "order",
          "text": "Order something to drink (Quiero…)"
        },
        {
          "id": "like",
          "text": "Say what you like (Me gusta…)"
        },
        {
          "id": "plan",
          "text": "Say what you're going to buy (Voy a comprar…)"
        },
        {
          "id": "price",
          "text": "Ask the price of something (¿Cuánto cuesta…?)"
        }
      ],
      "targets": [
        "Quiero un jugo de naranja.",
        "Me gusta el café con leche.",
        "Voy a comprar fruta.",
        "¿Cuánto cuesta la camiseta?",
        "¿Qué quieres tomar?"
      ],
      "opening": "¡Hola! ¿Qué quieres tomar?",
      "script": [
        {
          "goal": "order",
          "expect": [
            "quiero",
            "tomar",
            "jugo",
            "cafe"
          ],
          "reply": "¡Buenísimo! Yo quiero un café con leche.",
          "hint": "Say \"Quiero un jugo de naranja.\""
        },
        {
          "goal": "like",
          "expect": [
            "me",
            "gusta"
          ],
          "reply": "A mí también me gusta el pan dulce.",
          "hint": "Say \"Me gusta el café con leche.\""
        },
        {
          "goal": "plan",
          "expect": [
            "voy",
            "comprar",
            "fruta"
          ],
          "reply": "¡Qué bien! Yo voy a comprar zapatos el sábado.",
          "hint": "Say \"Voy a comprar fruta.\""
        },
        {
          "goal": "price",
          "expect": [
            "cuanto",
            "cuesta"
          ],
          "reply": "Cuesta ocho dólares. ¡Es una oferta especial!",
          "hint": "Say \"¿Cuánto cuesta la camiseta?\""
        }
      ],
      "nudges": {
        "order": "Di qué quieres tomar.",
        "like": "Di qué te gusta.",
        "plan": "Di qué vas a comprar.",
        "price": "Pregunta el precio."
      },
      "fallbackReply": "¿Perdón? ¿Puedes repetir, por favor?",
      "closing": "¡Perfecto! Nos vemos el sábado en el mercado. ¡Adiós!",
      "maxTurns": 10
    },
    "fills": [
      {
        "before": "¿Cuánto",
        "after": "la camiseta?",
        "choices": [
          "cuesta",
          "cuestan",
          "cuestas"
        ],
        "answer": 0,
        "en": "How much is the T-shirt?"
      },
      {
        "before": "Voy a",
        "after": "fruta.",
        "choices": [
          "compro",
          "comprar",
          "compra"
        ],
        "answer": 1,
        "en": "I am going to buy fruit."
      },
      {
        "before": "La tienda",
        "after": "a las nueve.",
        "choices": [
          "cierran",
          "cierro",
          "cierra"
        ],
        "answer": 2,
        "en": "The store closes at nine."
      },
      {
        "before": "Me",
        "after": "el café con leche.",
        "choices": [
          "gustan",
          "gusta",
          "gusto"
        ],
        "answer": 1,
        "en": "I like coffee with milk."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Qué quieres tomar?"
          }
        ],
        "choices": [
          "Quiero un jugo de naranja.",
          "Voy a la tienda a las nueve.",
          "Sí, soy estudiante."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿Cuánto cuesta la camiseta?"
          }
        ],
        "choices": [
          "Me gusta el café.",
          "Cuesta quince dólares.",
          "La tienda cierra a las nueve."
        ],
        "answer": 1
      },
      {
        "lines": [
          {
            "who": "mara",
            "es": "Voy a ir de compras el sábado. ¿Vienes?"
          }
        ],
        "choices": [
          "Buenas noches, adiós.",
          "De nada.",
          "¡Sí, voy contigo!"
        ],
        "answer": 2
      }
    ],
    "reads": [
      {
        "passage": "OFERTA: Camisetas a diez dólares. Zapatos a veinte dólares. La tienda está abierta de nueve a seis.",
        "question": "How much are the T-shirts?",
        "choices": [
          "Ten dollars",
          "Twenty dollars",
          "Six dollars"
        ],
        "answer": 0
      },
      {
        "passage": "MENÚ DEL DÍA: sopa, pollo con arroz y jugo de naranja. Cuesta ocho dólares. Abierto de once a tres.",
        "question": "How much does the menu of the day cost?",
        "choices": [
          "Three dollars",
          "Eight dollars",
          "Eleven dollars"
        ],
        "answer": 1
      }
    ]
  },
  {
    topics: [
      { id: "a_shopping_list_and_a_short_", match: /Writing: A Shopping List and a Short Order/i },
      { id: "linking_and_rhythm_in_spoken", match: /Linking and Rhythm in Spoken Spanish/i },
      { id: "weak_words_and_sentence_stre", match: /Weak Words and Sentence Stress: Content versus Function/i },
      { id: "soft_b_d_and_g_between_vowel", match: /Soft B, D, and G Between Vowels/i },
      { id: "fixing_common_errors_with_pr", match: /Fixing Common Errors with Present Tense Basics/i },
    ],
    "unit": "Unit 4.11",
    "grade": "spanish_grade_04_time_food_shopping_and_core_verbs",
    "goal": "I can write a short shopping list and order, link words smoothly in speech, and fix common present tense errors.",
    "phrases": [
      {
        "id": "g4u11_necesito_leche_y_pan",
        "es": "Necesito leche y pan.",
        "en": [
          "I need milk and bread."
        ],
        "tier": 1,
        "skill": "es_present_ar",
        "topic": "a_shopping_list_and_a_short_"
      },
      {
        "id": "g4u11_quiero_dos_kilos_de_manzanas",
        "es": "Quiero dos kilos de manzanas.",
        "en": [
          "I want two kilos of apples."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "a_shopping_list_and_a_short_"
      },
      {
        "id": "g4u11_un_cafe_con_leche",
        "es": "Un café con leche.",
        "en": [
          "A coffee with milk.",
          "A latte."
        ],
        "tier": 1,
        "skill": "es_vocab_core",
        "topic": "a_shopping_list_and_a_short_"
      },
      {
        "id": "g4u11_tengo_que_comprar_pan",
        "es": "Tengo que comprar pan.",
        "en": [
          "I have to buy bread.",
          "I need to buy bread."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "a_shopping_list_and_a_short_"
      },
      {
        "id": "g4u11_la_escuela",
        "es": "la escuela",
        "en": [
          "the school"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "linking_and_rhythm_in_spoken"
      },
      {
        "id": "g4u11_un_hombre",
        "es": "un hombre",
        "en": [
          "a man"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "linking_and_rhythm_in_spoken"
      },
      {
        "id": "g4u11_vas_a_la_escuela",
        "es": "¿Vas a la escuela?",
        "en": [
          "Do you go to school?",
          "Are you going to school?"
        ],
        "tier": 2,
        "skill": "es_questions",
        "topic": "linking_and_rhythm_in_spoken"
      },
      {
        "id": "g4u11_la_alfombra",
        "es": "la alfombra",
        "en": [
          "the rug",
          "the carpet"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "weak_words_and_sentence_stre"
      },
      {
        "id": "g4u11_el_pan_de_la_mesa",
        "es": "el pan de la mesa",
        "en": [
          "the bread on the table"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "weak_words_and_sentence_stre"
      },
      {
        "id": "g4u11_la_casa_de_mara",
        "es": "la casa de Mara",
        "en": [
          "Mara's house",
          "the house of Mara"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "weak_words_and_sentence_stre"
      },
      {
        "id": "g4u11_el_lobo",
        "es": "el lobo",
        "en": [
          "the wolf"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "soft_b_d_and_g_between_vowel"
      },
      {
        "id": "g4u11_el_lago",
        "es": "el lago",
        "en": [
          "the lake"
        ],
        "tier": 2,
        "skill": "es_gender",
        "topic": "soft_b_d_and_g_between_vowel"
      },
      {
        "id": "g4u11_el_agua",
        "es": "el agua",
        "en": [
          "the water"
        ],
        "tier": 1,
        "skill": "es_gender",
        "topic": "soft_b_d_and_g_between_vowel",
        "art": "agua"
      },
      {
        "id": "g4u11_como_pan",
        "es": "Como pan.",
        "en": [
          "I eat bread."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "fixing_common_errors_with_pr"
      },
      {
        "id": "g4u11_bebemos_agua",
        "es": "Bebemos agua.",
        "en": [
          "We drink water."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "fixing_common_errors_with_pr"
      },
      {
        "id": "g4u11_viven_aqui",
        "es": "Viven aquí.",
        "en": [
          "They live here."
        ],
        "tier": 1,
        "skill": "es_present_erir",
        "topic": "fixing_common_errors_with_pr"
      }
    ],
    "scene": {
      "title": "En la tienda de Rosa",
      "art": "pan",
      "lines": [
        {
          "who": "narrator",
          "es": "Es sábado por la mañana. Mara y Tomás están en la tienda de Rosa.",
          "en": "It's Saturday morning. Mara and Tomás are at Rosa's store.",
          "art": "pan"
        },
        {
          "who": "rosa",
          "es": "¡Buenos días! ¿Qué necesitan?",
          "en": "Good morning! What do you need?"
        },
        {
          "who": "mara",
          "es": "Necesito leche y pan.",
          "en": "I need milk and bread."
        },
        {
          "who": "tomas",
          "es": "Yo quiero dos kilos de manzanas.",
          "en": "I want two kilos of apples."
        },
        {
          "who": "rosa",
          "es": "Muy bien. ¿Algo más?",
          "en": "Very good. Anything else?"
        },
        {
          "who": "mara",
          "es": "Sí, un café con leche, por favor.",
          "en": "Yes, a coffee with milk, please."
        },
        {
          "who": "diego",
          "es": "Yo tengo que comprar pan también.",
          "en": "I have to buy bread too."
        },
        {
          "who": "rosa",
          "es": "Muy bien. Aquí está todo.",
          "en": "Very good. Here is everything."
        }
      ],
      "questions": [
        {
          "after": 3,
          "kind": "read_respond",
          "question": "What does Mara need?",
          "choices": [
            "Milk and bread",
            "Two kilos of apples",
            "A coffee with milk"
          ],
          "answer": 0
        },
        {
          "after": 4,
          "kind": "read_respond",
          "question": "How many kilos of apples does Tomás want?",
          "choices": [
            "One",
            "Two",
            "Five"
          ],
          "answer": 1
        },
        {
          "after": 7,
          "kind": "read_respond",
          "question": "Who has to buy bread too?",
          "choices": [
            "Mara",
            "Tomás",
            "Diego"
          ],
          "answer": 2
        }
      ]
    },
    "convo": null,
    "fills": [
      {
        "before": "Necesito leche",
        "after": "pan.",
        "choices": [
          "y",
          "o",
          "de"
        ],
        "answer": 0,
        "en": "I need milk and bread."
      },
      {
        "before": "Quiero dos kilos",
        "after": "manzanas.",
        "choices": [
          "de",
          "en",
          "con"
        ],
        "answer": 0,
        "en": "I want two kilos of apples."
      },
      {
        "before": "Un café",
        "after": "leche.",
        "choices": [
          "con",
          "sin",
          "para"
        ],
        "answer": 0,
        "en": "A coffee with milk."
      },
      {
        "before": "Tengo que",
        "after": "pan.",
        "choices": [
          "comprar",
          "compro",
          "compra"
        ],
        "answer": 0,
        "en": "I have to buy bread."
      }
    ],
    "chats": [
      {
        "lines": [
          {
            "who": "rosa",
            "es": "¿Qué necesitas?"
          }
        ],
        "choices": [
          "Necesito leche y pan.",
          "Necesitas leche y pan.",
          "Necesito leche y pan, por favor?"
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "tomas",
            "es": "¿Cuántos kilos de manzanas quieres?"
          }
        ],
        "choices": [
          "Dos kilos, por favor.",
          "Hay dos kilos.",
          "Tengo dos kilos de manzanas."
        ],
        "answer": 0
      },
      {
        "lines": [
          {
            "who": "diego",
            "es": "¿A qué hora abren?"
          }
        ],
        "choices": [
          "A las ocho.",
          "Son las ocho.",
          "Por la mañana."
        ],
        "answer": 0
      }
    ],
    "reads": [
      {
        "passage": "Mara necesita leche y pan. Ella escribe una lista: leche, pan y dos kilos de manzanas. También quiere un café con leche.",
        "question": "What is on Mara's list?",
        "choices": [
          "Milk, bread, and apples",
          "Coffee and water",
          "Bread and cheese"
        ],
        "answer": 0
      },
      {
        "passage": "En la tienda, Rosa dice: «Abrimos a las ocho.» Tomás tiene que comprar pan. Él dice: «Gracias, Rosa.»",
        "question": "When does the store open?",
        "choices": [
          "At eight",
          "At nine",
          "At ten"
        ],
        "answer": 0
      }
    ]
  },
];
