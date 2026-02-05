import './palmier_sec.js'

export class OffersCard extends HTMLElement {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.innerHTML = `
      <style>
        .offers_card {
          margin: auto;
          margin-top: 36vh;
          display: flex;
          width: 448px;
          height: 520px;
          padding: 8px 8px 24px 8px;
          flex-direction: column;
          align-items: flex-start;
          gap: 20px;
          flex-shrink: 0;

          border-radius: 40px;
          background: #fff;

          /* shadow/card */
          box-shadow:
            0 0 2px 0 rgba(23, 29, 46, 0.04),
            0 1px 3px 0 rgba(23, 29, 46, 0.12);

          position: relative;
        }
        .product {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 16px;
          align-self: stretch;
        }
        .product_image {
          width: 448px;
          height: 448px;
          border-radius: 32px;
        }
        .product_info {
          display: flex;
          padding: 0 16px;
          flex-direction: row;
          justify-content: center;
          align-items: center;
          gap: 8px;
          align-self: stretch;
        }

        .palmiersec {
          position: absolute;
          right: -220px;
          bottom: 72px;
          transform: rotate(-16deg);
        }
        .product_info_container {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          flex: 1 0 0;
        }
        .title {
          align-self: stretch;
          color: var(--content-primary, #171d2e);

          /* Title/LG/Heavy/Default */
          font-family: 'Geist', sans-serif;
          font-size: 24px;
          font-style: normal;
          font-weight: 700;
          line-height: 28px; /* 116.667% */
          letter-spacing: -0.48px;
        }
        .sub_title {
          color: var(--content-secondary, #3a3e4a);

          /* Title/XS/Normal/Default */
          font-family: var(--semantic-font-family-title, Geist);
          font-size: var(--semantic-font-size-title-xs, 16px);
          font-style: normal;
          font-weight: var(--semantic-font-weight-title-normal, 400);
          line-height: var(--semantic-line-height-title-xs, 20px); /* 125% */
          letter-spacing: -0.32px;
        }
        .circle_btn {
          display: flex;
          width: 48px;
          height: 48px;
          justify-content: center;
          align-items: center;
          aspect-ratio: 1/1;

          border-radius: 100px;
          background: var(--brand, #ffdf6f);
        }
      </style>
      <div class="offers_card">
        <div class="product">
          <palmier-sec class="palmiersec"></palmier-sec>
          <img
            class="product_image"
            src="./images/product_image.webp"
            alt=""
            srcset=""
          />
          <div class="product_info">
            <div class="product_info_container">
              <div class="title">Waikiki</div>
              <div class="sub_title">Hawaii, United States of America</div>
            </div>
            <div class="circle_btn">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="17"
                viewBox="0 0 16 17"
                fill="none"
              >
                <path
                  d="M13.9993 10.9456C13.9993 11.4365 14.3973 11.8345 14.8882 11.8345C15.3791 11.8345 15.7771 11.4365 15.7771 10.9456L15.7771 2.0333C15.7772 1.7902 15.7773 1.52733 15.7474 1.30545C15.7125 1.04551 15.6226 0.713433 15.3431 0.433966C15.0637 0.154499 14.7316 0.0646204 14.4717 0.0296725C14.2498 -0.000159397 13.9869 -5.60086e-05 13.7438 3.96114e-05L4.83154 5.07493e-05C4.34062 5.0774e-05 3.94265 0.39802 3.94265 0.88894C3.94265 1.37986 4.34062 1.77783 4.83154 1.77783L12.7422 1.77783L1.09642 13.424C0.749293 13.7711 0.749302 14.3339 1.09644 14.681C1.44358 15.0282 2.00639 15.0282 2.35352 14.681L13.9993 3.03488L13.9993 10.9456Z"
                  fill="#171D2E"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    `
  }

  connectedCallback() {}
}
customElements.define('offers-card', OffersCard)
