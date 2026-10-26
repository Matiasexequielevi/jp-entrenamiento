const mongoose=require('mongoose');
const schema=new mongoose.Schema({nombre:{type:String,required:true},usuario:{type:String,required:true,unique:true,lowercase:true,trim:true},passwordHash:{type:String,required:true,select:false},activo:{type:Boolean,default:true}}, {timestamps:true});
module.exports=mongoose.model('Profesor',schema);
