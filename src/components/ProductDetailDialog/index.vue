<template>
    <el-dialog title="Item Details" :visible.sync="dialogVisible" width="960px" custom-class="item-detail-dialog"
        append-to-body>
        <div class="item-detail">
            <div class="top-section">

                <el-descriptions title="" :column="1">
                    <el-descriptions-item label="Product Name">
                        <a :href="`https://inventory.zoho.com/app/746138234#/inventory/items/${product.item_id}`" target="_blank" style="color: #409eff; text-decoration: underline;"> {{ product.name }} </a>
                       </el-descriptions-item>
                    <el-descriptions-item label="SKU">{{ product.sku }} </el-descriptions-item>
                    <el-descriptions-item label="Location">{{ product.Location }} </el-descriptions-item>
                    <el-descriptions-item label="Prefer Vendor" v-if="product['Prefer Vendor']">{{ product["Prefer Vendor"] }} </el-descriptions-item>
                    <el-descriptions-item label="Classification" v-if="product.Classification">{{ product.Classification }} </el-descriptions-item>
                    <el-descriptions-item label="Crazy Parts Link" v-if="product['Crazy Parts Link']">{{ product["Crazy Parts Link"] }}
                    </el-descriptions-item>
                    <el-descriptions-item label="Parts Home Link" v-if="product['Crazy Parts Link']">{{ product["Parts Home Link"] }}
                    </el-descriptions-item>




                </el-descriptions>
                <div class="image-card">
                    <img v-if="product.imgUrl" :src="product.imgUrl" />
                </div>
            </div>

            <div class="divider"></div>

            <div class="bottom-section">
                <div class="stock-card blue" v-if="product.priceList">
                    <div class="stock-title">
                        <span class="icon-wrap">
                            <i class="el-icon-money"></i>
                        </span>
                        <strong>Price List</strong>
                    </div>

                    <div class="stock-row">
                        <span>Platinum</span>
                        <strong>${{ product.priceList.platinum || 0 }}</strong>
                    </div>

                    <div class="stock-row">
                        <span>VIP</span>
                        <strong>${{ product.priceList.vip || 0 }}</strong>
                    </div>

                    <div class="stock-row">
                        <span>SVIP</span>
                        <strong>
                            ${{ product.priceList.svip || 0 }}
                        </strong>
                    </div>
                    <div class="stock-row">
                        <span>WholeSale</span>
                        <strong>
                            ${{ product.priceList.wholesale || 0 }}
                        </strong>
                    </div>
                </div>

                <div class="stock-card green">
                    <div class="stock-title">
                        <span class="icon-wrap green-bg">
                            <i class="el-icon-house"></i>
                        </span>
                        <strong>Stock On Hand</strong>
                    </div>

                    <div class="stock-row">
                        <span>Stock On Hand</span>
                        <strong>{{ getStock("physicalStock", "stockOnHand") }}</strong>
                    </div>

                    <div class="stock-row">
                        <span>Committed Stock</span>
                        <strong>{{ getStock("physicalStock", "commitedStock") }}</strong>
                    </div>

                    <div class="stock-row">
                        <span>Available Stock</span>
                        <strong class="green-text">
                            {{ getStock("physicalStock", "avaliableStock") }}
                        </strong>
                    </div>
                </div>


            </div>
            <h2>Sales Analize</h2>
        <SalesLineChart :sales="product.sales" />
        </div>

        <span slot="footer">
            <el-button @click="dialogVisible = false">Close</el-button>
        </span>
    </el-dialog>
</template>

<script>
import SalesLineChart from "@/components/SalesLineChart"
export default {
    components: {
        SalesLineChart
    },
    name: "ProductDetailDialog",

    props: {
        open: {
            type: Boolean,
            default: false,
        },
        product: {
            type: Object,
            default: function () {
                return {};
            },
        },
    },

    computed: {
        dialogVisible: {
            get: function () {
                return this.open;
            },
            set: function (value) {
                this.$emit("update:open", value);
            },
        },
    },

    methods: {
        formatStatus: function (status) {
            if (!status) return "-";
            return status.charAt(0).toUpperCase() + status.slice(1);
        },

        getStock: function (stockType, field) {
            if (!this.product) return 0;
            if (!this.product[stockType]) return 0;
            return this.product[stockType][field] || 0;
        },
    },
};
</script>

<style scoped>
.item-detail {
    padding: 4px 4px 0;
}

/* =========================
   Top Section
========================= */

.top-section {
    display: grid;
    grid-template-columns: 1fr 320px;
    gap: 36px;
    align-items: start;
}

.image-card {
    height: 320px;
    border: 1px solid #ebeef5;
    border-radius: 10px;
    background: #fafafa;

    display: flex;
    align-items: center;
    justify-content: center;
}

.image-card img {
    width: 88%;
    height: 88%;
    object-fit: contain;
}

.basic-info {
    padding-top: 10px;
}

.info-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 12px;

    margin-bottom: 28px;

    color: #111827;
    font-size: 15px;
}

.info-row .label {
    color: #606266;
}

.info-row strong {
    font-size: 17px;
    line-height: 1.5;
}

/* =========================
   Divider
========================= */

.divider {
    height: 1px;
    background: #ebeef5;
    margin: 22px 0 18px;
}

/* =========================
   Bottom Section
========================= */

.bottom-section {
    display: grid;
    grid-template-columns: 1fr 1fr 300px;
    gap: 18px;
    align-items: stretch;
}

/* =========================
   Stock Card
========================= */

.stock-card {
    border: 1px solid #ebeef5;
    border-radius: 10px;
    padding: 18px 22px;
    background: #fff;
}

.stock-title {
    display: flex;
    align-items: center;
    gap: 12px;

    margin-bottom: 18px;
}

.stock-title strong {
    font-size: 16px;
}

.stock-card.blue .stock-title {
    color: #1d4ed8;
}

.stock-card.green .stock-title {
    color: #15803d;
}

.icon-wrap {
    width: 38px;
    height: 38px;
    border-radius: 50%;

    background: #eff6ff;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 20px;
}

.green-bg {
    background: #f0fdf4;
}

.stock-row {
    display: flex;
    justify-content: space-between;

    padding: 11px 0;

    border-bottom: 1px solid #ebeef5;

    color: #606266;
}

.stock-row:last-child {
    border-bottom: none;
}

.stock-row strong {
    color: #111827;
}

.green-text {
    color: #15803d !important;
}

/* =========================
   Extra Info
========================= */

.extra-info {
    border-left: 1px solid #ebeef5;
    padding-left: 24px;
}

.extra-row {
    display: grid;
    grid-template-columns: 28px 1fr auto;

    align-items: center;
    gap: 8px;

    padding: 14px 0;

    border-bottom: 1px solid #ebeef5;

    color: #606266;
    font-size: 15px;
}

.extra-row:last-child {
    border-bottom: none;
}

.extra-row i {
    font-size: 21px;
}

.extra-row strong {
    color: #111827;
    font-size: 16px;
}

/* =========================
   Dialog Override
========================= */

::v-deep .item-detail-dialog {
    border-radius: 10px;
}

::v-deep .item-detail-dialog .el-dialog__header {
    padding: 26px 32px 14px;
}

::v-deep .item-detail-dialog .el-dialog__title {
    font-size: 22px;
    font-weight: 700;
    color: #111827;
}

::v-deep .item-detail-dialog .el-dialog__body {
    padding: 12px 32px 10px;
}

::v-deep .item-detail-dialog .el-dialog__footer {
    padding: 14px 32px 26px;
}
</style>
