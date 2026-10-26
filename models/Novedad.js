const mongoose=require('mongoose');
const schema=new mongoose.Schema({titulo:{type:String,required:true},mensaje:{type:String,required:true},tipo:{type:String,default:'info'},activa:{type:Boolean,default:true},fecha:{type:Date,default:Date.now}});
module.exports=mongoose.model('Novedad',schema);
