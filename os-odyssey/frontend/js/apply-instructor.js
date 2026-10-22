/**
 * ODYSSEY — Instructor Application Script
 * Handles teacher verification workflow, location auto-detection (GPS/IP),
 * cascading Country -> Region -> Province -> City lookup,
 * intelligent school autocomplete, document uploads, and application state.
 */

(function () {
  'use strict';

  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api'
    : 'https://os-odyssey-api.onrender.com/api';

  let currentUser = null;
  let currentSession = null;
  let idSelectedFile = null;
  let proofSelectedFile = null;
  let schoolSearchTimeout = null;

  // DOM Elements - Status Panels
  const stateLoading = document.getElementById('stateLoading');
  const stateAuthRequired = document.getElementById('stateAuthRequired');
  const stateAlreadyProfessor = document.getElementById('stateAlreadyProfessor');
  const statePending = document.getElementById('statePending');
  const stateDenied = document.getElementById('stateDenied');
  const instructorForm = document.getElementById('instructorForm');
  const formErrorMessage = document.getElementById('formErrorMessage');
  const submitAppBtn = document.getElementById('submitAppBtn');

  // Location & Cascading Elements: Country -> Region -> Province -> City
  const btnDetectLocation = document.getElementById('btnDetectLocation');
  const btnDetectLocationText = document.getElementById('btnDetectLocationText');
  const locationNotice = document.getElementById('locationNotice');
  const institutionCountry = document.getElementById('institutionCountry');

  const regionGroup = document.getElementById('regionGroup');
  const institutionRegion = document.getElementById('institutionRegion');
  const institutionRegionCustom = document.getElementById('institutionRegionCustom');

  const provinceGroup = document.getElementById('provinceGroup');
  const institutionProvince = document.getElementById('institutionProvince');
  const institutionProvinceCustom = document.getElementById('institutionProvinceCustom');

  const cityGroup = document.getElementById('cityGroup');
  const institutionCity = document.getElementById('institutionCity');
  const institutionCityCustom = document.getElementById('institutionCityCustom');

  // School Autocomplete Elements
  const institutionInput = document.getElementById('institution');
  const schoolSearchStatus = document.getElementById('schoolSearchStatus');
  const schoolSuggestionsContainer = document.getElementById('schoolSuggestionsContainer');
  const schoolSuggestionsList = document.getElementById('schoolSuggestionsList');
  const schoolCustomOption = document.getElementById('schoolCustomOption');

  // Document 1 Elements
  const idFileInput = document.getElementById('idFileInput');
  const idDropZone = document.getElementById('idDropZone');
  const idPreview = document.getElementById('idPreview');
  const idPreviewThumb = document.getElementById('idPreviewThumb');
  const idPreviewName = document.getElementById('idPreviewName');
  const idPreviewSize = document.getElementById('idPreviewSize');
  const idPreviewRemove = document.getElementById('idPreviewRemove');

  // Document 2 Elements
  const proofFileInput = document.getElementById('proofFileInput');
  const proofDropZone = document.getElementById('proofDropZone');
  const proofPreview = document.getElementById('proofPreview');
  const proofPreviewThumb = document.getElementById('proofPreviewThumb');
  const proofPreviewName = document.getElementById('proofPreviewName');
  const proofPreviewSize = document.getElementById('proofPreviewSize');
  const proofPreviewRemove = document.getElementById('proofPreviewRemove');

  // ─── Location Data: Country -> Region -> Province -> City ────

  const PH_REGIONS_AND_PROVINCES = {
    'Region XIII (Caraga)': {
      'Surigao del Norte': [
        'Surigao City', 'Dapa', 'Del Carmen', 'General Luna', 'Pilar', 'San Benito',
        'San Isidro', 'Santa Monica', 'Socorro', 'Burgos', 'Claver', 'Placer',
        'Mainit', 'Tagana-an', 'Sison', 'Tubod', 'Malimono', 'San Francisco (Anao-aon)',
        'Alegria', 'Bacuag', 'Gigaquit'
      ],
      'Agusan del Norte': [
        'Butuan City', 'Cabadbaran City', 'Buenavista', 'Carmen', 'Jabonga',
        'Kitcharao', 'Las Nieves', 'Magallanes', 'Nasipit', 'Remedios T. Romualdez',
        'Santiago', 'Tubay'
      ],
      'Surigao del Sur': [
        'Tandag City', 'Bislig City', 'Barobo', 'Bayabas', 'Cantilan', 'Carmen',
        'Carrascal', 'Cortes', 'Hinatuan', 'Lanuza', 'Lianga', 'Lingig',
        'Madrid', 'Marihatag', 'San Agustin', 'San Miguel', 'Tagbina', 'Tago'
      ],
      'Agusan del Sur': [
        'Bayugan City', 'Bunawan', 'Esperanza', 'La Paz', 'Loreto', 'Prosperidad',
        'Rosario', 'San Francisco', 'San Luis', 'Santa Josefa', 'Sibagat', 'Talacogon',
        'Trento', 'Veruela'
      ],
      'Dinagat Islands': [
        'San Jose', 'Basilisa', 'Cagdianao', 'Dinagat', 'Libjo', 'Loreto', 'Tubajon'
      ]
    },
    'NCR (National Capital Region / Metro Manila)': {
      'Metro Manila': [
        'Manila', 'Quezon City', 'Makati City', 'Taguig City (BGC)', 'Pasig City',
        'Mandaluyong City', 'Caloocan City', 'Pasay City', 'Parañaque City',
        'Las Piñas City', 'Muntinlupa City', 'Marikina City', 'Valenzuela City',
        'Malabon City', 'Navotas City', 'San Juan City', 'Pateros'
      ]
    },
    'Region VII (Central Visayas)': {
      'Cebu': [
        'Cebu City', 'Mandaue City', 'Lapu-Lapu City', 'Talisay City', 'Toledo City',
        'Naga City', 'Carcar City', 'Danao City', 'Bogo City', 'Balamban', 'Consolacion',
        'Liloan', 'Minglanilla', 'Cordova', 'Compostela', 'San Fernando', 'Argao'
      ],
      'Bohol': ['Tagbilaran City', 'Panglao', 'Dauis', 'Tubigon', 'Ubay', 'Carmen', 'Talibon'],
      'Negros Oriental': ['Dumaguete City', 'Bais City', 'Tanjay City', 'Bayawan City', 'Canlaon City', 'Siaton', 'Sibulan'],
      'Siquijor': ['Siquijor', 'Larena', 'Lazi', 'San Juan', 'Maria', 'Enrique Villanueva']
    },
    'Region XI (Davao Region)': {
      'Davao del Sur': ['Davao City', 'Digos City', 'Bansalan', 'Hagonoy', 'Magsaysay', 'Malalag', 'Matanao', 'Padada', 'Santa Cruz', 'Sulop'],
      'Davao del Norte': ['Tagum City', 'Panabo City', 'Samal City (IGACOS)', 'Carmen', 'Asuncion', 'Braulio E. Dujali', 'Kapalong', 'New Corella', 'San Isidro', 'Santo Tomas', 'Talaingod'],
      'Davao Oriental': ['Mati City', 'Baganga', 'Banaybanay', 'Boston', 'Caraga', 'Cateel', 'Governor Generoso', 'Lupon', 'Manay', 'San Isidro', 'Tarragona'],
      'Davao de Oro': ['Nabunturan', 'Compostela', 'Monkayo', 'Mawab', 'Pantukan', 'Maragusan', 'Montevista', 'New Bataan'],
      'Davao Occidental': ['Malita', 'Don Marcelino', 'Jose Abad Santos', 'Sarangani', 'Santa Maria']
    },
    'Region IV-A (CALABARZON)': {
      'Cavite': ['Bacoor City', 'Imus City', 'Dasmariñas City', 'General Trias City', 'Tagaytay City', 'Cavite City', 'Trece Martires City', 'Silang', 'Carmona', 'Kawit', 'Rosario', 'Tanza', 'Naic', 'Alfonso', 'Indang'],
      'Laguna': ['Calamba City', 'Santa Rosa City', 'Biñan City', 'Cabuyao City', 'San Pedro City', 'San Pablo City', 'Los Baños', 'Santa Cruz', 'Pagsanjan', 'Calauan', 'Bay', 'Victoria'],
      'Batangas': ['Batangas City', 'Lipa City', 'Tanauan City', 'Santo Tomas City', 'Nasugbu', 'Calaca City', 'Balayan', 'Bauan', 'Lemery', 'San Juan', 'Taal', 'Rosario'],
      'Rizal': ['Antipolo City', 'Cainta', 'Taytay', 'San Mateo', 'Rodriguez (Montalban)', 'Binangonan', 'Angono', 'Tanay', 'Morong', 'Baras', 'Cardona', 'Pililla', 'Teresa'],
      'Quezon': ['Lucena City', 'Tayabas City', 'Candelaria', 'Sariaya', 'Tiaong', 'Pagbilao', 'Mauban', 'Gumaca', 'Lopez', 'Infanta']
    },
    'Region III (Central Luzon)': {
      'Pampanga': ['San Fernando City', 'Angeles City', 'Mabalacat City', 'Guagua', 'Lubao', 'Mexico', 'Arayat', 'Candaba', 'Floridablanca', 'Porac', 'Santa Rita'],
      'Bulacan': ['Malolos City', 'Meycauayan City', 'San Jose del Monte City', 'Baliuag City', 'Marilao', 'Santa Maria', 'Bocaue', 'Guiguinto', 'Plaridel', 'Hagonoy', 'Calumpit'],
      'Bataan': ['Balanga City', 'Mariveles', 'Dinalupihan', 'Hermosa', 'Orani', 'Orion', 'Limay', 'Abucay', 'Bagac', 'Morong', 'Pilar'],
      'Tarlac': ['Tarlac City', 'Capas', 'Concepcion', 'Paniqui', 'Camiling', 'Gerona', 'Bamban', 'La Paz', 'Victoria'],
      'Nueva Ecija': ['Cabanatuan City', 'Palayan City', 'Gapan City', 'San Jose City', 'Muñoz City', 'Talavera', 'Guimba', 'San Leonardo', 'Santa Rosa'],
      'Zambales': ['Olongapo City', 'Subic', 'Iba', 'Castillejos', 'San Marcelino', 'Botolan', 'Santa Cruz', 'Masinloc', 'San Antonio'],
      'Aurora': ['Baler', 'Casiguran', 'Dilasag', 'Dinalungan', 'Dingalan', 'Dipaculao', 'Maria Aurora', 'San Luis']
    },
    'Region VI (Western Visayas)': {
      'Iloilo': ['Iloilo City', 'Passi City', 'Oton', 'Pavia', 'Santa Barbara', 'Pototan', 'Dumangas', 'Miagao', 'Guimbal', 'Carles'],
      'Negros Occidental': ['Bacolod City', 'Bago City', 'Cadiz City', 'Escalante City', 'Himamaylan City', 'Kabankalan City', 'La Carlota City', 'Sagay City', 'San Carlos City', 'Silay City', 'Sipalay City', 'Talisay City', 'Victorias City'],
      'Capiz': ['Roxas City', 'Panay', 'Pontevedra', 'Tapaz'],
      'Aklan': ['Kalibo', 'Malay (Boracay)', 'Numancia', 'Ibajay'],
      'Antique': ['San Jose de Buenavista', 'Sibalom', 'Hamtic', 'Culasi'],
      'Guimaras': ['Jordan', 'Buenavista', 'Nueva Valencia']
    },
    'Region X (Northern Mindanao)': {
      'Misamis Oriental': ['Cagayan de Oro City', 'Gingoog City', 'El Salvador City', 'Tagoloan', 'Villanueva', 'Jasaan', 'Opol'],
      'Lanao del Norte': ['Iligan City', 'Tubod', 'Kapatagan', 'Baroy', 'Lala'],
      'Bukidnon': ['Malaybalay City', 'Valencia City', 'Manolo Fortich', 'Maramag', 'Quezon', 'Don Carlos'],
      'Misamis Occidental': ['Ozamiz City', 'Oroquieta City', 'Tangub City', 'Clarin', 'Jimenez'],
      'Camiguin': ['Mambajao', 'Catarman', 'Guinsiliban', 'Mahinog', 'Sagay']
    },
    'Region I (Ilocos Region)': {
      'La Union': ['San Fernando City', 'Agoo', 'Bauang', 'San Juan', 'Bacnotan', 'Aringay', 'Rosario'],
      'Ilocos Norte': ['Laoag City', 'Batac City', 'San Nicolas', 'Dingras', 'Paoay', 'Pagudpud'],
      'Ilocos Sur': ['Vigan City', 'Candon City', 'Narvacan', 'Cabugao', 'Tagudin', 'Bantay'],
      'Pangasinan': ['Dagupan City', 'San Carlos City', 'Urdaneta City', 'Alaminos City', 'Lingayen', 'Rosales', 'Malasiqui', 'Bayambang', 'Mangaldan', 'Calasiao']
    },
    'Region II (Cagayan Valley)': {
      'Cagayan': ['Tuguegarao City', 'Aparri', 'Lal-lo', 'Baggao', 'Solana', 'Peñablanca'],
      'Isabela': ['Ilagan City', 'Cauayan City', 'Santiago City', 'Roxas', 'Echague', 'Tumauini', 'San Mateo'],
      'Nueva Vizcaya': ['Bayombong', 'Solano', 'Bambang', 'Aritao', 'Bagabag'],
      'Quirino': ['Cabarroguis', 'Diffun', 'Maddela', 'Saguday'],
      'Batanes': ['Basco', 'Itbayat', 'Ivana', 'Mahatao', 'Sabtang']
    },
    'Region V (Bicol Region)': {
      'Albay': ['Legazpi City', 'Ligao City', 'Tabaco City', 'Daraga', 'Guinobatan', 'Polangui', 'Camalig'],
      'Camarines Sur': ['Naga City', 'Iriga City', 'Pili', 'Calabanga', 'Nabua', 'Libmanan', 'Sipocot'],
      'Camarines Norte': ['Daet', 'Labo', 'Jose Panganiban', 'Mercedes'],
      'Sorsogon': ['Sorsogon City', 'Gubat', 'Bulan', 'Irosin', 'Pilar'],
      'Catanduanes': ['Virac', 'San Andres', 'Bato', 'Baras'],
      'Masbate': ['Masbate City', 'Aroroy', 'Cataingan', 'Milagros', 'Placer']
    },
    'Region VIII (Eastern Visayas)': {
      'Leyte': ['Tacloban City', 'Ormoc City', 'Baybay City', 'Palo', 'Tanauan', 'Carigara', 'Hilongos'],
      'Southern Leyte': ['Maasin City', 'Sogod', 'Macrohon', 'Bontoc', 'Malitbog', 'Hinunangan'],
      'Samar': ['Catbalogan City', 'Calbayog City', 'Basey', 'Gandara'],
      'Eastern Samar': ['Borongan City', 'Guiuan', 'Dolores', 'Oras', 'Balangiga'],
      'Northern Samar': ['Catarman', 'Laoang', 'Allen', 'Gamay', 'Palapag'],
      'Biliran': ['Naval', 'Biliran', 'Cabucgayan', 'Caibiran', 'Kawayan']
    },
    'Region IX (Zamboanga Peninsula)': {
      'Zamboanga del Sur': ['Zamboanga City', 'Pagadian City', 'Molave', 'Aurora', 'Dumalinao'],
      'Zamboanga del Norte': ['Dipolog City', 'Dapitan City', 'Sindangan', 'Labason', 'Siocon'],
      'Zamboanga Sibugay': ['Ipil', 'Titay', 'Kabasalan', 'Diplahan'],
      'Basilan': ['Isabela City']
    },
    'Region XII (SOCCSKSARGEN)': {
      'South Cotabato': ['General Santos City', 'Koronadal City', 'Polomolok', 'Surallah', 'Tupi'],
      'Cotabato': ['Kidapawan City', 'Midsayap', 'Pikit', 'Kabacan', 'Makilala'],
      'Sultan Kudarat': ['Tacurong City', 'Isulan', 'Lebak', 'Esperanza', 'Kalamansig'],
      'Sarangani': ['Alabel', 'Glan', 'Malungon', 'Kiamba', 'Maasim'],
      'Maguindanao': ['Cotabato City']
    },
    'CAR (Cordillera Administrative Region)': {
      'Benguet': ['Baguio City', 'La Trinidad', 'Itogon', 'Tuba', 'Tublay'],
      'Kalinga': ['Tabuk City', 'Pinukpuk', 'Pasil', 'Lubuagan'],
      'Abra': ['Bangued', 'Bucay', 'Dolores', 'Tayum'],
      'Apayao': ['Conner', 'Flora', 'Luna', 'Pudtol'],
      'Ifugao': ['Lagawe', 'Banaue', 'Kiangan', 'Alfonso Lista'],
      'Mountain Province': ['Bontoc', 'Bauko', 'Sagada', 'Besao']
    },
    'BARMM (Bangsamoro)': {
      'Maguindanao del Norte': ['Cotabato City', 'Datu Odin Sinsuat', 'Parang', 'Sultan Kudarat'],
      'Maguindanao del Sur': ['Buluan', 'Datu Paglas', 'Shariff Aguak'],
      'Lanao del Sur': ['Marawi City', 'Malabang', 'Wao', 'Balabagan'],
      'Basilan': ['Lamitan City', 'Sumisip', 'Maluso', 'Tuburan'],
      'Sulu': ['Jolo', 'Indanan', 'Parang', 'Talipao'],
      'Tawi-Tawi': ['Bongao', 'Panglima Sugala', 'Sitangkai']
    },
    'Region IV-B (MIMAROPA)': {
      'Palawan': ['Puerto Princesa City', 'Coron', 'El Nido', 'Brooke\'s Point', 'Roxas'],
      'Oriental Mindoro': ['Calapan City', 'Naujan', 'Pinamalayan', 'Victoria', 'Puerto Galera'],
      'Occidental Mindoro': ['San Jose', 'Sablayan', 'Mamburao', 'Santa Cruz'],
      'Marinduque': ['Boac', 'Santa Cruz', 'Gasan', 'Mogpog', 'Torrijos'],
      'Romblon': ['Romblon', 'Odiongan', 'San Agustin', 'Cajidiocan']
    }
  };

  const US_LOCATIONS = {
    'West': {
      'California': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno', 'Long Beach', 'Oakland'],
      'Washington': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Olympia'],
      'Oregon': ['Portland', 'Eugene', 'Salem', 'Gresham', 'Hillsboro', 'Bend']
    },
    'Northeast': {
      'New York': ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany'],
      'Massachusetts': ['Boston', 'Worcester', 'Springfield', 'Cambridge', 'Lowell'],
      'Pennsylvania': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading']
    },
    'South': {
      'Texas': ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso', 'Arlington'],
      'Florida': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee', 'Fort Lauderdale'],
      'Georgia': ['Atlanta', 'Augusta', 'Columbus', 'Macon', 'Savannah']
    },
    'Midwest': {
      'Illinois': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford', 'Springfield'],
      'Ohio': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'],
      'Michigan': ['Detroit', 'Grand Rapids', 'Warren', 'Sterling Heights', 'Ann Arbor']
    }
  };

  const ALL_COUNTRIES = [
    'Philippines', 'United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Singapore', 'Japan', 'Germany',
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Austria', 'Azerbaijan',
    'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
    'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Cambodia', 'Cameroon', 'Chile', 'China',
    'Colombia', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Dominican Republic',
    'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Georgia', 'Ghana',
    'Greece', 'Guatemala', 'Honduras', 'Hong Kong', 'Hungary', 'Iceland', 'Indonesia', 'Iran', 'Iraq', 'Ireland',
    'Israel', 'Italy', 'Jamaica', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Laos', 'Latvia', 'Lebanon',
    'Lithuania', 'Luxembourg', 'Madagascar', 'Malaysia', 'Maldives', 'Malta', 'Mauritius', 'Mexico', 'Moldova',
    'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Myanmar', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
    'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Poland', 'Portugal',
    'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia', 'Slovakia', 'Slovenia', 'South Africa',
    'South Korea', 'Spain', 'Sri Lanka', 'Sweden', 'Switzerland', 'Taiwan', 'Tanzania', 'Thailand', 'Trinidad and Tobago',
    'Tunisia', 'Turkey', 'Uganda', 'Ukraine', 'United Arab Emirates', 'Uruguay', 'Uzbekistan', 'Vatican City',
    'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
  ];

  function hideAllStates() {
    if (stateLoading) stateLoading.style.display = 'none';
    if (stateAuthRequired) stateAuthRequired.classList.remove('active');
    if (stateAlreadyProfessor) stateAlreadyProfessor.classList.remove('active');
    if (statePending) statePending.classList.remove('active');
    if (stateDenied) stateDenied.classList.remove('active');
    if (instructorForm) instructorForm.style.display = 'none';
  }

  function showState(el) {
    hideAllStates();
    if (el === instructorForm) {
      el.style.display = 'block';
    } else if (el) {
      el.classList.add('active');
    }
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file, maxWidth = 1600, quality = 0.85) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        return resolve(file);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
            } else {
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  }

  // ─── Setup Location: Country -> Region -> Province -> City ─

  function initLocationSystem() {
    // Populate Countries Select
    if (institutionCountry) {
      institutionCountry.innerHTML = '<option value="">Select Country</option>';
      ALL_COUNTRIES.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        institutionCountry.appendChild(opt);
      });

      institutionCountry.addEventListener('change', handleCountryChange);
    }

    // Region Select Listener
    if (institutionRegion) {
      institutionRegion.addEventListener('change', handleRegionChange);
    }

    // Province Select Listener
    if (institutionProvince) {
      institutionProvince.addEventListener('change', handleProvinceChange);
    }

    // City Select Listener
    if (institutionCity) {
      institutionCity.addEventListener('change', handleCityChange);
    }

    // Custom Input toggles
    institutionRegionCustom?.addEventListener('input', () => {
      if (institutionInput?.value.trim().length >= 2) searchSchools(institutionInput.value.trim());
    });
    institutionProvinceCustom?.addEventListener('input', () => {
      if (institutionInput?.value.trim().length >= 2) searchSchools(institutionInput.value.trim());
    });
    institutionCityCustom?.addEventListener('input', () => {
      if (institutionInput?.value.trim().length >= 2) searchSchools(institutionInput.value.trim());
    });

    // Geolocation / GPS Button
    if (btnDetectLocation) {
      btnDetectLocation.addEventListener('click', handleDetectLocation);
    }

    // School Autocomplete Search
    if (institutionInput) {
      institutionInput.addEventListener('input', handleSchoolInput);
      institutionInput.addEventListener('focus', () => {
        if (institutionInput.value.trim().length >= 2) {
          schoolSuggestionsContainer.style.display = 'block';
        }
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (schoolSuggestionsContainer &&
        !schoolSuggestionsContainer.contains(e.target) &&
        e.target !== institutionInput) {
        schoolSuggestionsContainer.style.display = 'none';
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && schoolSuggestionsContainer) {
        schoolSuggestionsContainer.style.display = 'none';
      }
    });
  }

  function handleCountryChange() {
    const selectedCountry = institutionCountry.value.trim();

    // Reset downstream fields
    resetRegion();
    resetProvince();
    resetCity();

    if (!selectedCountry) {
      regionGroup.style.display = 'none';
      return;
    }

    // Show ONLY Region bar
    regionGroup.style.display = 'block';

    // Populate Region Select
    institutionRegion.innerHTML = '<option value="">Select Region</option>';

    if (selectedCountry === 'Philippines') {
      Object.keys(PH_REGIONS_AND_PROVINCES).forEach(reg => {
        const opt = document.createElement('option');
        opt.value = reg;
        opt.textContent = reg;
        institutionRegion.appendChild(opt);
      });
    } else if (selectedCountry === 'United States') {
      Object.keys(US_LOCATIONS).forEach(reg => {
        const opt = document.createElement('option');
        opt.value = reg;
        opt.textContent = reg;
        institutionRegion.appendChild(opt);
      });
    }

    // Custom option
    const otherOpt = document.createElement('option');
    otherOpt.value = 'other';
    otherOpt.textContent = 'Other / Type custom region...';
    institutionRegion.appendChild(otherOpt);
  }

  function handleRegionChange() {
    const selectedRegion = institutionRegion.value.trim();

    resetProvince();
    resetCity();

    if (selectedRegion === 'other') {
      institutionRegionCustom.style.display = 'block';
      institutionRegionCustom.focus();
      // Show Province with custom input
      provinceGroup.style.display = 'block';
      institutionProvince.innerHTML = '<option value="other">Type custom province...</option>';
      institutionProvinceCustom.style.display = 'block';
      // Show City with custom input
      cityGroup.style.display = 'block';
      institutionCity.innerHTML = '<option value="other">Type custom city...</option>';
      institutionCityCustom.style.display = 'block';
      return;
    } else {
      institutionRegionCustom.style.display = 'none';
      institutionRegionCustom.value = '';
    }

    if (!selectedRegion) {
      provinceGroup.style.display = 'none';
      return;
    }

    // Show Province bar
    provinceGroup.style.display = 'block';
    institutionProvince.innerHTML = '<option value="">Select Province</option>';

    const selectedCountry = institutionCountry.value.trim();
    let provinces = [];

    if (selectedCountry === 'Philippines' && PH_REGIONS_AND_PROVINCES[selectedRegion]) {
      provinces = Object.keys(PH_REGIONS_AND_PROVINCES[selectedRegion]);
    } else if (selectedCountry === 'United States' && US_LOCATIONS[selectedRegion]) {
      provinces = Object.keys(US_LOCATIONS[selectedRegion]);
    }

    provinces.forEach(prov => {
      const opt = document.createElement('option');
      opt.value = prov;
      opt.textContent = prov;
      institutionProvince.appendChild(opt);
    });

    const otherProv = document.createElement('option');
    otherProv.value = 'other';
    otherProv.textContent = 'Other / Type custom province...';
    institutionProvince.appendChild(otherProv);
  }

  function handleProvinceChange() {
    const selectedProvince = institutionProvince.value.trim();

    resetCity();

    if (selectedProvince === 'other') {
      institutionProvinceCustom.style.display = 'block';
      institutionProvinceCustom.focus();
      cityGroup.style.display = 'block';
      institutionCity.innerHTML = '<option value="other">Type custom city...</option>';
      institutionCityCustom.style.display = 'block';
      return;
    } else {
      institutionProvinceCustom.style.display = 'none';
      institutionProvinceCustom.value = '';
    }

    if (!selectedProvince) {
      cityGroup.style.display = 'none';
      return;
    }

    // Show City / Municipality bar
    cityGroup.style.display = 'block';
    institutionCity.innerHTML = '<option value="">Select City / Municipality</option>';

    const selectedCountry = institutionCountry.value.trim();
    const selectedRegion = institutionRegion.value.trim();
    let cities = [];

    if (selectedCountry === 'Philippines' &&
      PH_REGIONS_AND_PROVINCES[selectedRegion] &&
      PH_REGIONS_AND_PROVINCES[selectedRegion][selectedProvince]) {
      cities = PH_REGIONS_AND_PROVINCES[selectedRegion][selectedProvince];
    } else if (selectedCountry === 'United States' &&
      US_LOCATIONS[selectedRegion] &&
      US_LOCATIONS[selectedRegion][selectedProvince]) {
      cities = US_LOCATIONS[selectedRegion][selectedProvince];
    }

    cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      institutionCity.appendChild(opt);
    });

    const otherCity = document.createElement('option');
    otherCity.value = 'other';
    otherCity.textContent = 'Other / Type custom municipality...';
    institutionCity.appendChild(otherCity);
  }

  function handleCityChange() {
    const selectedCity = institutionCity.value.trim();
    if (selectedCity === 'other') {
      institutionCityCustom.style.display = 'block';
      institutionCityCustom.focus();
    } else {
      institutionCityCustom.style.display = 'none';
      institutionCityCustom.value = '';
    }

    // Refresh school suggestions if school input has text
    if (institutionInput && institutionInput.value.trim().length >= 2) {
      searchSchools(institutionInput.value.trim());
    }
  }

  function resetRegion() {
    if (regionGroup) regionGroup.style.display = 'none';
    if (institutionRegion) institutionRegion.value = '';
    if (institutionRegionCustom) {
      institutionRegionCustom.style.display = 'none';
      institutionRegionCustom.value = '';
    }
  }

  function resetProvince() {
    if (provinceGroup) provinceGroup.style.display = 'none';
    if (institutionProvince) institutionProvince.value = '';
    if (institutionProvinceCustom) {
      institutionProvinceCustom.style.display = 'none';
      institutionProvinceCustom.value = '';
    }
  }

  function resetCity() {
    if (cityGroup) cityGroup.style.display = 'none';
    if (institutionCity) institutionCity.value = '';
    if (institutionCityCustom) {
      institutionCityCustom.style.display = 'none';
      institutionCityCustom.value = '';
    }
  }

  function getEffectiveRegion() {
    if (institutionRegion?.value === 'other') {
      return institutionRegionCustom?.value.trim() || '';
    }
    return institutionRegion?.value.trim() || '';
  }

  function getEffectiveProvince() {
    if (institutionProvince?.value === 'other') {
      return institutionProvinceCustom?.value.trim() || '';
    }
    return institutionProvince?.value.trim() || '';
  }

  function getEffectiveCity() {
    if (institutionCity?.value === 'other') {
      return institutionCityCustom?.value.trim() || '';
    }
    return institutionCity?.value.trim() || '';
  }

  // ─── GPS & Network Location Auto-Detection ───────────────

  async function handleDetectLocation() {
    if (!btnDetectLocation) return;
    btnDetectLocation.disabled = true;
    if (btnDetectLocationText) btnDetectLocationText.textContent = 'Detecting Location...';
    if (locationNotice) locationNotice.style.display = 'none';

    function applyDetectedLocation(country, regionName, provinceName, cityName, amenity) {
      if (country) {
        const match = Array.from(institutionCountry.options).find(
          o => o.value.toLowerCase() === country.toLowerCase()
        );
        if (match) {
          institutionCountry.value = match.value;
        } else {
          institutionCountry.value = country;
        }
        handleCountryChange();
      }

      // Match Region
      if (regionName && institutionRegion) {
        const regMatch = Array.from(institutionRegion.options).find(
          o => o.value.toLowerCase().includes(regionName.toLowerCase()) ||
            regionName.toLowerCase().includes(o.value.toLowerCase())
        );
        if (regMatch) {
          institutionRegion.value = regMatch.value;
          handleRegionChange();
        } else {
          institutionRegion.value = 'other';
          handleRegionChange();
          if (institutionRegionCustom) institutionRegionCustom.value = regionName;
        }
      }

      // Match Province
      if (provinceName && institutionProvince) {
        const provMatch = Array.from(institutionProvince.options).find(
          o => o.value.toLowerCase().includes(provinceName.toLowerCase()) ||
            provinceName.toLowerCase().includes(o.value.toLowerCase())
        );
        if (provMatch) {
          institutionProvince.value = provMatch.value;
          handleProvinceChange();
        } else {
          institutionProvince.value = 'other';
          handleProvinceChange();
          if (institutionProvinceCustom) institutionProvinceCustom.value = provinceName;
        }
      }

      // Match City
      if (cityName && institutionCity) {
        const cityMatch = Array.from(institutionCity.options).find(
          o => o.value.toLowerCase().includes(cityName.toLowerCase()) ||
            cityName.toLowerCase().includes(o.value.toLowerCase())
        );
        if (cityMatch) {
          institutionCity.value = cityMatch.value;
        } else {
          institutionCity.value = 'other';
          if (institutionCityCustom) {
            institutionCityCustom.style.display = 'block';
            institutionCityCustom.value = cityName;
          }
        }
      }

      if (amenity && institutionInput && !institutionInput.value) {
        institutionInput.value = amenity;
      }

      if (locationNotice) {
        locationNotice.textContent = `Location detected: ${[cityName, provinceName, regionName, country].filter(Boolean).join(', ')}`;
        locationNotice.style.display = 'block';
      }
    }

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
              { headers: { 'Accept': 'application/json' } }
            );

            if (res.ok) {
              const data = await res.json();
              const addr = data.address || {};
              const country = addr.country || 'Philippines';
              const regionName = addr.region || addr['ISO3166-2-lvl3'] || 'Region XIII (Caraga)';
              const provinceName = addr.state || addr.province || addr.county || 'Surigao del Norte';
              const cityName = addr.city || addr.town || addr.municipality || 'Surigao City';
              const amenity = addr.amenity || '';

              applyDetectedLocation(country, regionName, provinceName, cityName, amenity);
              resetDetectBtn();
              return;
            }
          } catch (e) {
            console.warn('Reverse geocode failed:', e);
          }
          fallbackIp(applyDetectedLocation);
        },
        () => {
          fallbackIp(applyDetectedLocation);
        },
        { timeout: 7000, enableHighAccuracy: true }
      );
    } else {
      fallbackIp(applyDetectedLocation);
    }
  }

  async function fallbackIp(applyDetectedLocation) {
    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false) {
          const country = data.country || 'Philippines';
          const regRaw = data.region || 'Region XIII (Caraga)';
          const cityName = data.city || 'Surigao City';
          // Determine province for Caraga / Surigao
          let provName = 'Surigao del Norte';
          if (regRaw.toLowerCase().includes('caraga')) {
            provName = 'Surigao del Norte';
          }
          applyDetectedLocation(country, 'Region XIII (Caraga)', provName, cityName, null);
          resetDetectBtn();
          return;
        }
      }
    } catch (e) {
      console.warn('IP lookup failed:', e);
    }

    if (locationNotice) {
      locationNotice.textContent = 'Could not auto-detect location. Please select region manually.';
      locationNotice.style.display = 'block';
    }
    resetDetectBtn();
  }

  function resetDetectBtn() {
    if (btnDetectLocation) btnDetectLocation.disabled = false;
    if (btnDetectLocationText) btnDetectLocationText.textContent = 'Detect Location (GPS)';
  }

  // ─── Intelligent School Search & Autocomplete ────────────

  function handleSchoolInput(e) {
    const query = e.target.value.trim();
    clearTimeout(schoolSearchTimeout);

    if (query.length < 2) {
      if (schoolSuggestionsContainer) schoolSuggestionsContainer.style.display = 'none';
      if (schoolSearchStatus) schoolSearchStatus.textContent = '';
      return;
    }

    if (schoolSearchStatus) schoolSearchStatus.textContent = 'Searching...';

    schoolSearchTimeout = setTimeout(() => {
      searchSchools(query);
    }, 320);
  }

  async function searchSchools(query) {
    const country = institutionCountry?.value?.trim() || '';
    const province = getEffectiveProvince();
    const city = getEffectiveCity();

    if (schoolCustomOption) {
      schoolCustomOption.textContent = `Use custom school: "${query}"`;
      schoolCustomOption.onclick = () => {
        institutionInput.value = query;
        schoolSuggestionsContainer.style.display = 'none';
      };
    }

    try {
      let searchQuery = query;
      if (city && !query.toLowerCase().includes(city.toLowerCase())) {
        searchQuery += ` ${city}`;
      } else if (province && !query.toLowerCase().includes(province.toLowerCase())) {
        searchQuery += ` ${province}`;
      }

      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=8`;
      if (country === 'Philippines') {
        url += '&countrycodes=ph';
      }

      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      let items = [];

      if (res.ok) {
        const data = await res.json();
        items = (data || []).map(d => {
          const typeBadge = d.type === 'college' ? 'College' :
            d.type === 'university' ? 'University' :
              d.type === 'school' ? 'School' : 'Educational Institution';
          return {
            name: d.name || d.display_name.split(',')[0],
            fullAddress: d.display_name,
            type: typeBadge,
          };
        }).filter(item => item.name);
      }

      // If Surigao or State University is queried and not yet in results, add Surigao Del Norte State University
      const qLower = query.toLowerCase();
      if ((qLower.includes('surigao') || qLower.includes('del norte') || qLower.includes('snsu')) &&
        !items.some(i => i.name.toLowerCase().includes('surigao del norte state university'))) {
        items.unshift({
          name: 'Surigao Del Norte State University',
          fullAddress: 'Surigao Del Norte State University, Narciso Street, Surigao City, Caraga, Philippines',
          type: 'State University',
        });
      }

      renderSchoolSuggestions(items, query);

    } catch (err) {
      console.warn('School lookup error:', err);
      if (schoolSearchStatus) schoolSearchStatus.textContent = '';
    }
  }

  function renderSchoolSuggestions(items, query) {
    if (schoolSearchStatus) schoolSearchStatus.textContent = items.length ? `${items.length} schools located` : '';
    if (!schoolSuggestionsList) return;

    if (!items.length) {
      schoolSuggestionsList.innerHTML = `
        <div style="padding:0.6rem 0.8rem;font-size:0.8rem;color:rgba(255,255,255,0.45);font-family:'Nunito',sans-serif;">
          No exact database match. You can type and use any custom institution.
        </div>
      `;
      schoolSuggestionsContainer.style.display = 'block';
      return;
    }

    schoolSuggestionsList.innerHTML = items.map(item => `
      <div class="school-suggest-row" style="padding:0.6rem 0.75rem;border-radius:6px;cursor:pointer;transition:background 0.15s;font-family:'Nunito',sans-serif;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <strong style="color:#fff;font-size:0.85rem;">${esc(item.name)}</strong>
          <span style="font-size:0.68rem;padding:0.15rem 0.45rem;border-radius:4px;background:rgba(56,189,248,0.15);color:#38bdf8;white-space:nowrap;">${esc(item.type)}</span>
        </div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.45);margin-top:0.15rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(item.fullAddress)}
        </div>
      </div>
    `).join('');

    const rows = schoolSuggestionsList.querySelectorAll('.school-suggest-row');
    rows.forEach((row, idx) => {
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(245, 166, 35, 0.12)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('click', () => {
        institutionInput.value = items[idx].name;
        schoolSuggestionsContainer.style.display = 'none';
        if (schoolSearchStatus) schoolSearchStatus.textContent = '';
      });
    });

    schoolSuggestionsContainer.style.display = 'block';
  }

  // ─── Setup File Upload Handlers ──────────────────────────

  function setupUploadHandlers(dropZone, fileInput, previewEl, thumbEl, nameEl, sizeEl, removeBtn, onSelect, onClear) {
    if (!dropZone || !fileInput) return;

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length) {
        handleFileSelection(dt.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length) {
        handleFileSelection(fileInput.files[0]);
      }
    });

    removeBtn?.addEventListener('click', () => {
      fileInput.value = '';
      previewEl.classList.remove('active');
      dropZone.style.display = 'block';
      onClear();
    });

    function handleFileSelection(file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10 MB limit. Please select a smaller file.');
        fileInput.value = '';
        return;
      }

      onSelect(file);
      nameEl.textContent = file.name;
      sizeEl.textContent = formatBytes(file.size);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          thumbEl.src = e.target.result;
          thumbEl.style.display = 'block';
        };
        reader.readAsDataURL(file);
      } else {
        thumbEl.src = '../../assets/favicon.png';
        thumbEl.style.display = 'block';
      }

      previewEl.classList.add('active');
      dropZone.style.display = 'none';
    }
  }

  // ─── Supabase / Direct Storage Uploader ──────────────────

  async function uploadVerificationDocument(file, folderName) {
    const supa = window.supa;
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folderName}/${currentUser.id}/${Date.now()}_${cleanFileName}`;

    // Attempt 1: Upload to instructor-verifications bucket
    try {
      const { data, error } = await supa.storage
        .from('instructor-verifications')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });

      if (!error && data) {
        const { data: urlData } = supa.storage.from('instructor-verifications').getPublicUrl(path);
        if (urlData?.publicUrl) return urlData.publicUrl;
      }
    } catch (e) {
      // Continue to fallback
    }

    // Attempt 2: Fallback to classroom-files bucket
    try {
      const { data, error } = await supa.storage
        .from('classroom-files')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });

      if (!error && data) {
        const { data: urlData } = supa.storage.from('classroom-files').getPublicUrl(path);
        if (urlData?.publicUrl) return urlData.publicUrl;
      }
    } catch (e) {
      // Continue to base64 fallback
    }

    // Attempt 3: Inlined data URL (guaranteed never to fail)
    return await readFileAsDataUrl(file);
  }

  // ─── Render Pending Summary ──────────────────────────────

  function renderPendingSummary(app) {
    const summaryGrid = document.getElementById('pendingSummaryGrid');
    if (!summaryGrid) return;

    const date = new Date(app.created_at || Date.now()).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const locationParts = [app.city, app.province, app.region, app.country].filter(Boolean);
    const locationText = locationParts.join(', ') || 'Not specified';

    summaryGrid.innerHTML = `
      <div class="summary-item">
        <strong>Applicant Name</strong>
        <span>${esc(app.full_name || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Location (City / Prov / Region)</strong>
        <span>${esc(locationText)}</span>
      </div>
      <div class="summary-item">
        <strong>School / University</strong>
        <span>${esc(app.institution || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Department</strong>
        <span>${esc(app.department || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Academic Title</strong>
        <span>${esc(app.position_title || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Teaching Experience</strong>
        <span>${esc(app.years_experience || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Target Subjects</strong>
        <span>${esc(app.subjects_taught || 'N/A')}</span>
      </div>
      <div class="summary-item">
        <strong>Application Date</strong>
        <span>${date}</span>
      </div>
      <div class="summary-item">
        <strong>Verification Status</strong>
        <span style="color:#f5a623;">Pending Manual Verification</span>
      </div>
    `;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // ─── Main Application Logic ──────────────────────────────

  async function initApplyPage() {
    initLocationSystem();

    // Wait for Supabase client
    let attempts = 0;
    while (!window.supa && attempts < 25) {
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!window.supa) {
      hideAllStates();
      alert('Unable to connect to service. Please refresh the page.');
      return;
    }

    const { data: { session } } = await window.supa.auth.getSession();
    if (!session || !session.user) {
      showState(stateAuthRequired);
      return;
    }

    currentSession = session;
    currentUser = session.user;

    const { data: profile } = await window.supa
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    const role = profile?.role || 'student';

    if (role === 'professor' || role === 'admin') {
      showState(stateAlreadyProfessor);
      return;
    }

    try {
      const { data: apps, error: fetchErr } = await window.supa
        .from('instructor_applications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!fetchErr && apps && apps.length > 0) {
        const app = apps[0];
        if (app.status === 'pending') {
          renderPendingSummary(app);
          showState(statePending);
          return;
        } else if (app.status === 'denied') {
          const deniedNote = document.getElementById('deniedReviewNote');
          if (deniedNote) {
            deniedNote.textContent = app.review_note
              ? `Reviewer feedback: "${app.review_note}". You may update your information and submit revised documents.`
              : 'Your previous application was not approved. Please review your credentials and submit clear verification documents.';
          }

          document.getElementById('btnReapply')?.addEventListener('click', () => {
            showState(instructorForm);
            prefillForm(profile, app);
          });

          showState(stateDenied);
          return;
        } else if (app.status === 'approved') {
          if (role !== 'professor' && role !== 'admin') {
            try {
              await window.supa.from('profiles').update({ role: 'professor' }).eq('id', currentUser.id);
            } catch (e) {
              console.warn('Could not auto-sync profile role:', e);
            }
          }
          showState(stateAlreadyProfessor);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not check prior application status:', e);
    }

    showState(instructorForm);
    prefillForm(profile, null);

    // Setup file pickers
    setupUploadHandlers(
      idDropZone,
      idFileInput,
      idPreview,
      idPreviewThumb,
      idPreviewName,
      idPreviewSize,
      idPreviewRemove,
      (file) => { idSelectedFile = file; },
      () => { idSelectedFile = null; }
    );

    setupUploadHandlers(
      proofDropZone,
      proofFileInput,
      proofPreview,
      proofPreviewThumb,
      proofPreviewName,
      proofPreviewSize,
      proofPreviewRemove,
      (file) => { proofSelectedFile = file; },
      () => { proofSelectedFile = null; }
    );

    instructorForm.addEventListener('submit', handleFormSubmit);
  }

  function prefillForm(profile, previousApp) {
    const fullNameInput = document.getElementById('fullName');
    const workEmailInput = document.getElementById('workEmail');
    const departmentInput = document.getElementById('department');
    const positionSelect = document.getElementById('positionTitle');
    const experienceSelect = document.getElementById('yearsExperience');
    const subjectsInput = document.getElementById('subjectsTaught');
    const reasonInput = document.getElementById('applyReason');
    const phoneInput = document.getElementById('phoneNumber');

    if (previousApp) {
      if (fullNameInput) fullNameInput.value = previousApp.full_name || '';
      if (workEmailInput) workEmailInput.value = previousApp.work_email || currentSession.user.email || '';
      if (departmentInput) departmentInput.value = previousApp.department || '';
      if (positionSelect) positionSelect.value = previousApp.position_title || '';
      if (experienceSelect) experienceSelect.value = previousApp.years_experience || '';
      if (subjectsInput) subjectsInput.value = previousApp.subjects_taught || '';
      if (reasonInput) reasonInput.value = previousApp.reason || '';
      if (phoneInput) phoneInput.value = previousApp.phone_number || '';

      if (previousApp.country && institutionCountry) {
        institutionCountry.value = previousApp.country;
        handleCountryChange();
      }
      if (previousApp.region && institutionRegion) {
        institutionRegion.value = previousApp.region;
        handleRegionChange();
      }
      if (previousApp.province && institutionProvince) {
        institutionProvince.value = previousApp.province;
        handleProvinceChange();
      }
      if (previousApp.city && institutionCity) {
        institutionCity.value = previousApp.city;
      }
      if (previousApp.institution && institutionInput) {
        institutionInput.value = previousApp.institution;
      }
    } else {
      if (fullNameInput && !fullNameInput.value) {
        fullNameInput.value = profile?.username || '';
      }
      if (workEmailInput && !workEmailInput.value) {
        workEmailInput.value = currentSession.user.email || '';
      }
      // Default country to Philippines
      if (institutionCountry && !institutionCountry.value) {
        institutionCountry.value = 'Philippines';
        handleCountryChange();
      }
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    if (formErrorMessage) formErrorMessage.style.display = 'none';

    // Validate documents
    if (!idSelectedFile) {
      showError('Please upload a valid Institutional / Faculty ID.');
      return;
    }

    if (!proofSelectedFile) {
      showError('Please upload photo proof demonstrating you are an active teacher.');
      return;
    }

    const affirmation = document.getElementById('affirmationCheck');
    if (!affirmation || !affirmation.checked) {
      showError('You must affirm that your submitted credentials are genuine.');
      return;
    }

    submitAppBtn.disabled = true;
    submitAppBtn.textContent = 'Optimizing & Uploading Faculty ID...';

    try {
      // Compress images before upload/saving to ensure fast transmission and low payload
      const compressedIdFile = await compressImage(idSelectedFile, 1600, 0.85);
      const idUrl = await uploadVerificationDocument(compressedIdFile, 'faculty_ids');

      submitAppBtn.textContent = 'Optimizing & Uploading Teaching Proof...';
      const compressedProofFile = await compressImage(proofSelectedFile, 1600, 0.85);
      const proofUrl = await uploadVerificationDocument(compressedProofFile, 'teaching_proofs');

      submitAppBtn.textContent = 'Submitting Instructor Application...';

      const payload = {
        user_id: currentUser.id,
        full_name: document.getElementById('fullName').value.trim(),
        country: institutionCountry?.value?.trim() || '',
        region: getEffectiveRegion(),
        province: getEffectiveProvince(),
        city: getEffectiveCity(),
        institution: institutionInput.value.trim(),
        department: document.getElementById('department').value.trim(),
        position_title: document.getElementById('positionTitle').value.trim(),
        years_experience: document.getElementById('yearsExperience').value.trim(),
        work_email: document.getElementById('workEmail').value.trim(),
        phone_number: document.getElementById('phoneNumber').value.trim() || null,
        subjects_taught: document.getElementById('subjectsTaught').value.trim(),
        id_document_url: idUrl,
        id_document_name: idSelectedFile.name,
        teaching_proof_url: proofUrl,
        teaching_proof_name: proofSelectedFile.name,
        reason: document.getElementById('applyReason').value.trim(),
        status: 'pending',
      };

      // Check if user already has a pending or denied application
      const { data: existingApps } = await window.supa
        .from('instructor_applications')
        .select('id, status')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(1);

      let savedApp = null;

      if (existingApps && existingApps.length > 0 && (existingApps[0].status === 'pending' || existingApps[0].status === 'denied')) {
        const updatePayload = {
          ...payload,
          status: 'pending',
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
          created_at: new Date().toISOString(),
        };

        const { data: updated, error: updateErr } = await window.supa
          .from('instructor_applications')
          .update(updatePayload)
          .eq('id', existingApps[0].id)
          .select()
          .single();

        if (updateErr) {
          // Fallback to inserting if update policy was blocked
          const { data: inserted, error: insertErr } = await window.supa
            .from('instructor_applications')
            .insert([payload])
            .select()
            .single();

          if (insertErr) throw insertErr;
          savedApp = inserted;
        } else {
          savedApp = updated;
        }
      } else {
        const { data: inserted, error: insertErr } = await window.supa
          .from('instructor_applications')
          .insert([payload])
          .select()
          .single();

        if (insertErr) throw insertErr;
        savedApp = inserted;
      }

      renderPendingSummary(savedApp || payload);
      showState(statePending);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('Application submit error:', err);
      let message = err.message || 'An error occurred while submitting your application. Please try again.';
      if (err.code === '42P01') {
        message = 'Database table "instructor_applications" not found. Please run migration-010-instructor-applications.sql in your Supabase SQL Editor.';
      } else if (err.code === '42501') {
        message = 'Permission denied by database security policy. Please ensure migration-010 RLS policies are applied in your Supabase SQL Editor.';
      }
      showError(message);
      submitAppBtn.disabled = false;
      submitAppBtn.textContent = 'Submit Instructor Application';
    }
  }

  function showError(msg) {
    if (formErrorMessage) {
      formErrorMessage.textContent = msg;
      formErrorMessage.style.display = 'block';
      formErrorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert(msg);
    }
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApplyPage);
  } else {
    initApplyPage();
  }

})();
