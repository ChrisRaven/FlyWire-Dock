(() => {
  const DOCK_ID = 'kk-dock'
  const WRAPPER_CLASS = DOCK_ID + '-addon-wrapper'

  if (!document.getElementById(DOCK_ID)) {
    let dock = document.createElement('div')
    dock.id = DOCK_ID
    document.body.appendChild(dock)
    let userId = null

    let waitForMenu = setInterval(() => {
      let menu = document.getElementsByClassName('nge-gs-links')
      if (!menu.length) return

      let link = document.createElement('div')
      link.classList.add('nge-gs-link')
      link.innerHTML = '<button>Addons</button>'
      link.addEventListener('click', toggleAddonsWraper)
      menu[0].appendChild(link)

      clearInterval(waitForMenu)
    }, 100)

    let waitForUserProfile = setInterval(() => {
      userId = document.querySelector('#loggedInUserDropdown .nge-usercard-email')
      if (userId) {
        clearInterval(waitForUserProfile)
        userId = userId.textContent
      }
    }, 100)
    

    function toggleAddonsWraper() {
      // source why window.getComputedStyle(): https://stackoverflow.com/a/2298849
      dock.style.display = window.getComputedStyle(dock).display === 'none' ? 'flex' : 'none'
    }


    globalThis.Dock = class {
      static #instance = null
      static container = {
        el: document.getElementById(DOCK_ID),
        style: null
      }

      gridSize = 15

      constructor() {
        if (!Dock.instance) {
          Dock.instance = this
          this.#addStyles()
          this.#createGrid()

          this.#creatEditButton()
          this.editable = false
          this.grabbedAddon = null
          Dock.container.style = window.getComputedStyle(Dock.container.el)


          Dock.container.el.addEventListener('mousedown', (e) => this.#editableMouseDownHandler(e))
          Dock.container.el.addEventListener('mouseup'  , (e) => this.#editableMouseUpHandler(e))
          Dock.container.el.addEventListener('mousemove', (e) => this.#editableMouseMoveHandler(e))
        }

        return Dock.instance
      }

      #editableMouseDownHandler(e) {
        if (!this.editable) return
        if (!e.target.classList.contains('legend') && !e.target.parentElement.classList.contains('legend')) return

        let addon = e.target
        while (!addon.classList.contains(WRAPPER_CLASS) || !addon.tagName === 'BODY') {
          addon = addon.parentElement
        }

        this.grabbedAddon = addon

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.X = e.clientX - this.grabbedAddon.style.left.slice(0, -2);
        this.Y = e.clientY - this.grabbedAddon.style.top.slice(0, -2);
      }


      #editableMouseUpHandler(e) {
        if (!this.editable) return
        if (!this.grabbedAddon) return

        let x = this.grabbedAddon.offsetLeft
        let y = this.grabbedAddon.offsetTop
        localStorage.setItem(userId + '-kk-dock-addon-position-' + this.grabbedAddon.id, `{"x": ${x}, "y": ${y}}`)
        this.grabbedAddon = null
      }

      
      #editableMouseMoveHandler(e) {
        if (!this.editable) return
        if (!this.grabbedAddon) return

        // Source: https://esstudio.site/2018/11/01/create-draggable-elements-with-javascript.html
        this.grabbedAddon.style.left = Math.floor((e.clientX - this.X) / this.gridSize) * this.gridSize + 'px';
        this.grabbedAddon.style.top = Math.floor((e.clientY - this.Y) / this.gridSize) * this.gridSize + 'px';
      }


      #creatEditButton() {
        let editButton = document.createElement('button')
        editButton.id = DOCK_ID + '-edit-button'
        editButton.textContent = 'E'
        editButton.addEventListener('click', () => this.#editButtonHandle())
        Dock.container.el.appendChild(editButton)
      }


      #editButtonHandle() {
        this.#toggleGrid()
        this.editable = !this.editable
      }


      #addStyles() {
        let style = document.createElement('style')
        style.type = 'text/css'
        style.textContent = /*css*/`
          :root {
            --kk-dock-addon-button-color: #5454d3;
          }

          #${DOCK_ID} {
            display: none;
            background-color: rgba(30, 30, 30, 0.95);
            position: absolute;
            width: 405px;
            min-height: 200px;
            top: 0;
            left: 0;
            z-index: 31;
            align-items: flex-start;
            flex-wrap: wrap;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            border-radius: 4px;
          }

          #${DOCK_ID}-edit-button {
            position: absolute;
            top: 0;
            right: 0;
            height: 15px !important;
            width: 15px !important;
            background-color: red !important;
            padding: 0 !important;
            margin: 0 !important;
            font-size: 10px;
            border: none !important;
            border-radius: unset !important;
          }

          .${WRAPPER_CLASS} {
            border: 1px solid #404040;
            border-radius: 4px;
            padding: 7px 2px 2px 2px;
            margin: 3px;
            margin-top: 10px;
            position: absolute;
          }

          .${WRAPPER_CLASS} .legend {
            position: absolute;
            top: -7px;
            font-size: 11px;
            color: #c3c3c3;
            font-family: sans-serif;
            left: 0;
            right: 0;
            text-align: center;
            cursor: default;
          }

          .${WRAPPER_CLASS} .legend > span {
            background-color: rgba(30, 30, 30, 0.95);
          }

          .${WRAPPER_CLASS} button {
            color: white;
            background-color: transparent;
            border: 1px solid var(--kk-dock-addon-button-color);
            border-radius: 4px;
            margin: 2px;
            padding: 4px 8px;
            cursor: pointer;
          }

          .hline{
            height: 1px;
            position: absolute;
            background-color: #444;
          }
          
          .vline{
            width: 1px;
            position: absolute;
            background-color: #444;
          }
        `
        document.head.appendChild(style)
      }


      addAddon({ id, name, html, css, events }) {
        if (!html) return console.error('Dock: Missing HTML')
        if (!name) return console.error('Dock: Missing name')
        if (!events || !Object.keys(events).length) return console.error('Dock: Missing events')

        if (!id) {
          id = parseInt((Math.random() * 1000000), 10)
        }

        if (css) {
          css = `<style>${css}</style>`
          document.head.insertAdjacentHTML('beforeend', css)
        }

        html = /*html*/`
          <div id="${id}" class="${WRAPPER_CLASS}">
            <div class="legend">
              <span>&nbsp;${name}&nbsp;</span>
            </div>
            ${html}
          </div>
        `
        Dock.container.el.insertAdjacentHTML('beforeend', html)

        for (const [selector, value] of Object.entries(events)) {
          for (const [event, listener] of Object.entries(value)) {
            document.querySelector(selector).addEventListener(event, e => listener(e))
          }
        }

        let ls = localStorage.getItem(userId + '-kk-dock-addon-position-' + id)
        console.log(userId + '-kk-dock-addon-position-' + id)
        if (ls) {
          ls = JSON.parse(ls)
          document.getElementById(id).style.left = ls.x + 'px'
          document.getElementById(id).style.top = ls.y + 'px'
        }
      }

      #createGrid() {
        let frag = document.createDocumentFragment()
        let wrapper = document.createElement('div')
        wrapper.id = DOCK_ID + '-grid'
        wrapper.style.display = 'none'
        frag = frag.appendChild(wrapper)

        dock.style.display = 'flex'
        let width = dock.offsetWidth
        let height = dock.offsetHeight
        dock.style.display = 'none'

        for (let i = 0; i <= width; i += this.gridSize) {
          let div = document.createElement('div')
          div.classList.add('vline')
          div.style.left = i + 'px'
          div.style.height = height + 'px'
          frag.appendChild(div)
        }

        for (let i = 0; i <= height; i += this.gridSize) {
          let div = document.createElement('div')
          div.classList.add('hline')
          div.style.top = i + 'px'
          div.style.width = width + 'px'
          frag.appendChild(div)
        }

        this.grid = dock.appendChild(frag)
      }

      #toggleGrid() {
        this.grid.style.display = window.getComputedStyle(this.grid).display === 'none' ? 'block' : 'none'        
      }
 
    }

  }

})()
