"use strict";

/* ==========================================================================
   script.js — page interactions
   --------------------------------------------------------------------------
   Runs AFTER render.js, so every list (projects, certificates, filters…)
   already exists in the page when the events below are attached.
   ========================================================================== */

/** Toggle the "active" class on an element. */
const elementToggleFunc = function (elem) {
  elem.classList.toggle("active");
};


/* ---------------------------------------------------------------------------
   Sidebar — "Show Contacts" button on mobile
   ------------------------------------------------------------------------- */
const sidebar = document.querySelector("[data-sidebar]");
const sidebarBtn = document.querySelector("[data-sidebar-btn]");

sidebarBtn.addEventListener("click", function () {
  elementToggleFunc(sidebar);
  // tell screen readers whether the contacts are shown
  sidebarBtn.setAttribute("aria-expanded", String(sidebar.classList.contains("active")));
});


/* ---------------------------------------------------------------------------
   Certifications — open the clicked certificate in a modal
   ------------------------------------------------------------------------- */
const testimonialsItem = document.querySelectorAll("[data-testimonials-item]");
const modalContainer = document.querySelector("[data-modal-container]");
const modalCloseBtn = document.querySelector("[data-modal-close-btn]");
const overlay = document.querySelector("[data-overlay]");
const modalText = document.querySelector("[data-modal-text]");

let modalOpener = null; // element to return focus to when the modal closes

/**
 * Focus an element as soon as it can take focus.
 * (The modal fades in with a CSS transition; until it is visible the
 * browser refuses focus, so we retry on the next frames.)
 */
const focusWhenVisible = function (element, framesLeft = 60) {
  element.focus();
  if (document.activeElement !== element && framesLeft > 0) {
    requestAnimationFrame(() => focusWhenVisible(element, framesLeft - 1));
  }
};

const testimonialsModalFunc = function () {
  modalContainer.classList.toggle("active");
  overlay.classList.toggle("active");

  if (modalContainer.classList.contains("active")) {
    focusWhenVisible(modalCloseBtn); // keyboard / screen-reader users land inside the modal
  } else if (modalOpener) {
    modalOpener.focus(); // ...and go back to the card they opened
  }
};

/** Open the modal with the content of a certificate / testimonial card. */
const openCardModal = function (card) {
  modalOpener = card;
  const content = card.querySelector("[data-testimonials-text]");
  modalText.replaceChildren(...Array.from(content.childNodes, (node) => node.cloneNode(true)));
  testimonialsModalFunc();
};

for (let i = 0; i < testimonialsItem.length; i++) {
  testimonialsItem[i].addEventListener("click", function () {
    openCardModal(this);
  });
  // the cards act as buttons: Enter or Space opens them
  testimonialsItem[i].addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCardModal(this);
    }
  });
}

modalCloseBtn.addEventListener("click", testimonialsModalFunc);
overlay.addEventListener("click", testimonialsModalFunc);

// while the modal is open: Escape closes it, Tab stays inside it
document.addEventListener("keydown", function (event) {
  if (!modalContainer.classList.contains("active")) return;
  if (event.key === "Escape") testimonialsModalFunc();
  if (event.key === "Tab") {
    event.preventDefault();
    modalCloseBtn.focus(); // the close button is the only control inside
  }
});


/* ---------------------------------------------------------------------------
   Portfolio filter — category buttons (desktop) and dropdown (mobile)
   ------------------------------------------------------------------------- */
const select = document.querySelector("[data-select]");
const selectItems = document.querySelectorAll("[data-select-item]");
const selectValue = document.querySelector("[data-selecct-value]");
const filterBtn = document.querySelectorAll("[data-filter-btn]");
const filterItems = document.querySelectorAll("[data-filter-item]");

const filterStatus = document.querySelector("[data-filter-status]");

/** Show the projects of one category ("all" shows everything). */
const filterFunc = function (selectedValue) {
  let shown = 0;
  for (let i = 0; i < filterItems.length; i++) {
    const matches = selectedValue === "all" || selectedValue === filterItems[i].dataset.category;
    filterItems[i].classList.toggle("active", matches);
    if (matches) shown++;
  }
  // screen readers announce the result
  filterStatus.textContent = `Showing ${shown} project${shown === 1 ? "" : "s"}.`;

  // keep the desktop buttons in sync (pressed state)
  for (let i = 0; i < filterBtn.length; i++) {
    filterBtn[i].setAttribute("aria-pressed", String(filterBtn[i].textContent.trim().toLowerCase() === selectedValue));
  }
};

// mobile dropdown
select.addEventListener("click", function () {
  elementToggleFunc(this);
  select.setAttribute("aria-expanded", String(select.classList.contains("active")));
});

for (let i = 0; i < selectItems.length; i++) {
  selectItems[i].addEventListener("click", function () {
    const selectedValue = this.textContent.trim().toLowerCase();
    selectValue.textContent = this.textContent;
    elementToggleFunc(select);
    select.setAttribute("aria-expanded", "false");
    select.focus();
    filterFunc(selectedValue);
  });
}

// desktop buttons
let lastClickedBtn = filterBtn[0];

for (let i = 0; i < filterBtn.length; i++) {
  filterBtn[i].addEventListener("click", function () {
    const selectedValue = this.textContent.trim().toLowerCase();
    selectValue.textContent = this.textContent;
    filterFunc(selectedValue);

    lastClickedBtn.classList.remove("active");
    this.classList.add("active");
    lastClickedBtn = this;
  });
}


/* ---------------------------------------------------------------------------
   Contact form — enable the button when valid, then send the e-mail
   ------------------------------------------------------------------------- */
const form = document.querySelector("[data-form]");
const formInputs = document.querySelectorAll("[data-form-input]");
const formBtn = document.querySelector("[data-form-btn]");

const cName = document.getElementById("C_name");
const cMail = document.getElementById("C_mail");
const CMessage = document.getElementById("C_message");
const formStatus = document.querySelector("[data-form-status]");

for (let i = 0; i < formInputs.length; i++) {
  formInputs[i].addEventListener("input", function () {
    if (form.checkValidity()) {
      formBtn.removeAttribute("disabled");
    } else {
      formBtn.setAttribute("disabled", "");
    }
  });
}

// NOTE: these SMTP credentials are visible to anyone who opens this file.
// Replace them with a form service (e.g. Formspree) when possible.
function sendEmail() {
  const bodyMessage = `Full Name:   ${cName.value} <br><br> Email:  ${cMail.value}  <br><br>  Massage:   ${CMessage.value} `;

  Email.send({
    Host: "smtp.elasticemail.com",
    Username: "abdallahzezo794@gmail.com",
    Password: "38D4AC0452B2425FF14CCC5FDF8C75ED4E4B",
    To: "abdallahzezo794@gmail.com",
    From: "abdallahzezo794@gmail.com",
    Subject: "Client Message",
    Body: bodyMessage,
  }).then((message) => {
    if (message == "OK") {
      formStatus.textContent = "Your message was sent successfully.";
      Swal.fire({
        title: "Success!",
        text: "Message Sent Successfully ",
        icon: "success",
      });
    } else {
      formStatus.textContent = "Sorry, your message could not be sent. Please email me directly.";
    }
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sendEmail();
  form.reset();
  formBtn.setAttribute("disabled", "");
});


/* ---------------------------------------------------------------------------
   Page navigation — About / Resume / Portfolio / Contact
   ------------------------------------------------------------------------- */
const navigationLinks = document.querySelectorAll("[data-nav-link]");
const pages = document.querySelectorAll("[data-page]");

for (let i = 0; i < navigationLinks.length; i++) {
  navigationLinks[i].addEventListener("click", function () {
    const target = this.textContent.trim().toLowerCase();
    for (let j = 0; j < pages.length; j++) {
      const isTarget = pages[j].dataset.page === target;
      pages[j].classList.toggle("active", isTarget);
      navigationLinks[j].classList.toggle("active", isTarget);
      // tell screen readers which page is open
      if (isTarget) navigationLinks[j].setAttribute("aria-current", "page");
      else navigationLinks[j].removeAttribute("aria-current");

      // move focus to the new page title so keyboard / screen-reader users start there
      if (isTarget) pages[j].querySelector(".article-title").focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  });
}


/* ---------------------------------------------------------------------------
   Animated background (particles.js settings)
   ------------------------------------------------------------------------- */
/* particlesJS.load(@dom-id, @path-json, @callback (optional)); */
particlesJS.load("particles-js", "assets/js/particles.json", function () {
  console.log("callback - particles.js config loaded");
});

particlesJS("particles-js", {
  particles: {
    number: {
      value: 300,
      density: {
        enable: true,
        value_area: 1500,
      },
    },
    color: {
      value: "#ccc",
    },
    shape: {
      type: "triangle",
      stroke: {
        width: 0,
        color: "#000000",
      },
      polygon: {
        nb_sides: 10,
      },
      image: {
        src: "img/github.svg",
        width: 100,
        height: 100,
      },
    },
    opacity: {
      value: 0.5,
      random: false,
      anim: {
        enable: false,
        speed: 1,
        opacity_min: 0.1,
        sync: false,
      },
    },
    size: {
      value: 3,
      random: true,
      anim: {
        enable: false,
        speed: 40,
        size_min: 0.1,
        sync: false,
      },
    },
    line_linked: {
      enable: true,
      distance: 150,
      color: "#fec966",
      opacity: 0.4,
      width: 1,
    },
    move: {
      enable: true,
      speed: 3,
      direction: "none",
      random: true,
      straight: false,
      out_mode: "out",
      bounce: true,
      attract: {
        enable: false,
        rotateX: 600,
        rotateY: 1200,
      },
    },
  },
  interactivity: {
    detect_on: "window",
    events: {
      onhover: {
        enable: true,
        mode: "repulse",
      },
      onclick: {
        enable: true,
        mode: "push",
      },
      resize: true,
    },
    modes: {
      grab: {
        distance: 140,
        line_linked: {
          opacity: 1,
        },
      },
      bubble: {
        distance: 400,
        size: 100,
        duration: 2,
        opacity: 8,
        speed: 3,
      },
      repulse: {
        distance: 100,
        duration: 0.4,
      },
      push: {
        particles_nb: 4,
      },
      remove: {
        particles_nb: 2,
      },
    },
  },
  retina_detect: true,
});
